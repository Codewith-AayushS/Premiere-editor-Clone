# Architecture

This document describes how the Premiere Pro Clone actually works, based on the current codebase. It is intended for contributors who want to touch the timeline, the render pipeline, or the backend API.

## High-level overview

```
┌─────────────────────────────── Browser ───────────────────────────────┐
│  React 19 + TypeScript + Tailwind 4 (Vite dev server → :5173)          │
│                                                                        │
│  App.tsx (EditorLayout + KeyboardShortcutsOverlay)                     │
│    ├── TopMenuBar / workspace tabs (Editing, Color, Effects, Audio,    │
│    │   Graphics, Export)                                               │
│    ├── ProjectBin          ← media library, drag & drop import         │
│    ├── SourceMonitor       ← asset inspection, In/Out marks            │
│    ├── ProgramMonitor      ← <canvas> composite of the sequence        │
│    ├── MultitrackTimeline  ← V1–V3 / A1–A3, razor, ripple, trimming    │
│    ├── EffectControls      ← Motion / Opacity / Speed inspector        │
│    ├── AudioVUMeter        ← Web Audio stereo peak meter               │
│    └── workspaces/*        ← Lumetri Color, Effects Library,           │
│                              Audio Mixer, Essential Graphics panels    │
│                                                                        │
│  EditorContext.tsx — single source of truth for the open Project       │
└──────────────┬────────────────────────────────────┬────────────────────┘
               │  /api/* (Vite dev proxy → :5001)   │ /uploads, /exports
┌──────────────▼────────────────────────────────────▼────────────────────┐
│  Express 5 backend (server.js, :5001)                                  │
│                                                                        │
│  REST endpoints          │ spawed system binaries                      │
│  ├─ /api/upload          │ ── ffprobe  → metadata probing              │
│  ├─ /api/media           │ ── ffmpeg   → thumbnails, sample media      │
│  ├─ /api/render (+status │ ── ffmpeg   → multi-track MP4 render        │
│  │   /download, /export) │                                             │
│  ├─ /api/projects/*      │  Filesystem stores                          │
│  └─ /api/status          │  ├─ uploads/    (source media + thumbnails) │
│                          │  ├─ exports/    (rendered MP4s)             │
│                          │  └─ projects/   (.prproj.json + autosave)   │
└─────────────────────────────────────────────────────────────────────────┘
```

The client never touches the render engine directly. It ships the *state of the currently open project* (tracks + clips + asset URLs) to `/api/render`, and the server compiles that into a single FFmpeg `filter_complex` invocation.

## Frontend

### Source layout

```
src/
├── main.tsx                 # ReactDOM bootstrap
├── App.tsx                  # EditorLayout: panel grid + shortcuts overlay
├── context/EditorContext.tsx  # ~2,800 lines: global editor state + actions
├── types/editor.ts          # All shared domain types (~600 lines, no logic)
├── utils/
│   ├── audioEngine.ts       # Web Audio playback graph helpers
│   ├── audioEnvelope.ts     # Volume-automation helpers (preview parity)
│   ├── colorProcessing.ts   # Hue-wheel → RGB math shared with the server
│   ├── captions.ts          # Caption-clip detection helper
│   ├── magicEdit.ts         # Natural-language "Magic Edit" prompt planner
│   └── timecode.ts          # SMPTE timecode + duration formatting
├── components/              # Monitors, timeline, bin, inspector, export modal
└── components/workspaces/   # One big panel per specialist workspace
```

### State management

`EditorContext.tsx` is the application brain. It is a single React context provider that owns:

- The **open `Project`** (see "Data model") — tracks, clips, assets, playhead, markers.
- **Derived/editor state** — active tool, active workspace, selected clip IDs, zoom, view settings, source monitor reference, export queue.
- **Playback infrastructure** — a `requestAnimationFrame` render loop that advances the playhead, redraws the Program Monitor, and drives per-track Web Audio graphs (buffers are cached per asset id in an `AudioBufferCache`).
- **Persistence** — `Ctrl+S` manual save, timed autosave to `localStorage` (key `pr_autosave_project`, restored on reload) plus server-side version history (`/api/projects/autosave`, keeps the 20 newest versions per project).

Components fan out into pure-ish view components that consume `useEditor()`. If you add a new editing capability, keep the logic in the context and leave components rendering from context state.

### Data model (`src/types/editor.ts`)

The most important types:

| Type | Purpose |
|---|---|
| `Project` | Sequence settings (width/height/fps/duration) + `tracks[]`, `clips[]`, `assets[]`, playhead, In/Out points, markers. |
| `TimelineTrack` | One row of the timeline: `V1–V3` video (visible/lock) and `A1–A3` audio (mute/solo/lock/volume/pan). |
| `TimelineClip` | Placement of one asset on one track: `startTime`, `duration`, `inPoint/outPoint` (source trim), `speed`, `opacity`, `volume`, `fadeIn/fadeOut`, `pan`, `volumeKeyframes[]`, `transform`, optional `colorGrade`, `appliedEffects[]`, `textProperties`. |
| `MediaAsset` | One imported file: URL, type (`video`/`audio`/`image`), probed duration/resolution/fps, thumbnail URL. |
| `EnhancedColorGrade` | Full Lumetri-style grade: basic sliders, LUT, RGB curves, 3-way color wheels, HSL secondary, hue curves. |
| `AppliedEffect` | An effect instance from the library (blur, chroma key, reverb, EQ, …) with a `value` plus optional `params` and `keyframes`. |
| `TextProperties` | Titles/lower-thirds/captions: text, font, color, align; rendered on canvas in preview and by `drawtext` in export. |

Projects are stored as `.prproj.json`, so the model doubles as the persistence schema.

### Preview vs. export parity

A core design constraint: **the program monitor canvas and the FFmpeg export must show the same picture.** Both sides re-implement the same math:

- Clip `transform` (x/y/scale/rotation), opacity, and speed are applied identically on canvas and in FFmpeg filters.
- Color grading uses the same approximations in both places — e.g. 3-way color wheels share the hue→RGB conversion in `src/utils/colorProcessing.ts` and `buildColorWheelsFilter`-equivalent logic in `server.js`; RGB curves map to FFmpeg's `curves` filter on the server.
- Text clips: the preview draws `textProperties` onto the canvas; the export renders one `drawtext` per line plus an optional `drawbox` background (`buildTextOverlay` in `server.js`), with letter-spacing and alignment matched to the canvas.

When you add or change an effect, review both implementations and keep them in sync.

## Backend

`server.js` is one self-contained Express app (no build step, ESM, no routes split into files by design). Responsibilities:

1. **Static data**: `express.static` for `/uploads` (media + thumbnails) and `/exports` (render results).
2. **Ingest**: multer disk storage (`uploads/`, sanitized filename `{timestamp}_{name}`), `ffprobe` metadata probing, ffmpeg-generated 320×180 thumbnails, and first-boot generation of four sample media files (countdown, color bars, ambient track, title card) so the timeline is demoable.
3. **Render pipeline** (`POST /api/render`):
   - Builds `filter_complex` *by hand* as a string: base black canvas → for each visible video track (V1→V3 stacking order) each clip runs `trim → setpts (speed) → scale (fit) → effects/grade filters → overlay` with `between(t, start, end)` enable windows; audio clips run `atrim → atempo → audio effects → fades → pan → volume (+ automation) → adelay → amix`.
   - Text clips are rendered on transparent color layers with `drawtext`/`drawbox`.
   - The script is also written to a temp file (`os.tmpdir()/fffilter_<job>.txt`) as a safety valve for very long Windows command lines, and progress is streamed back via `ffmpeg -progress pipe:1` parsing (`out_time_us`).
   - Jobs live in an in-memory `Map` keyed by `jobId` (so render history is lost on server restart) and are polled by `/api/render/status/:jobId`.
4. **Project persistence**: `/api/projects/save|:id|autosave|relink|collect`.
5. **Quality/speed modes**: `fastest` (superfast/CRF 23, default), `balanced` (veryfast/CRF 21), `quality` (medium/CRF 19).

**Important**: `/api/render` always encodes H.264 video + AAC audio into an `mp4` container. The export modal also lists ProRes/WebM/AVI container presets, but the render pipeline does not switch codecs/containers — those presets visually label the file but reuse the H.264 pipeline. See "Limitations" in the README.

## Keyboard shortcuts

Defined in `App.tsx` (`SHORTCUTS` + the global key handler in `EditorContext`) and displayed in the in-app overlay (`?`). Keep this array in sync with any new bindings; the README shortcuts table mirrors it.

## Testing

There is currently no automated test suite. Manual smoke testing: `npm run dev`, import the generated sample media, cut/razor/ripple/speed-change clips, check preview playback with audio, then render an MP4 via the export modal and verify progress/completion endpoints.
