# Premiere Pro Clone

A non-linear video editing workstation inspired by Adobe Premiere Pro, built entirely with web technologies. Multi-track timeline editing, Lumetri-style color grading, an effects library, an audio mixer with real-time metering, project persistence, and **genuine server-side FFmpeg rendering to MP4**.

![Stack](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-6-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![FFmpeg](https://img.shields.io/badge/FFmpeg-9-green)

<!--
Screenshots: this repository ships no screenshots to keep it lightweight and
private-media free. If you add some, place them under docs/screenshots/ and
reference them here, e.g.
![Timeline](docs/screenshots/timeline.png)
-->

---

## Features

All features below are implemented in this repository — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how each one works.

### Editing & Timeline
- Multitrack timeline with three video tracks (`V1–V3`, visibility + lock) and three audio tracks (`A1–A3`, mute / solo / lock, volume and pan).
- Editing toolbar: Selection (`V`), Razor (`C`) to split clips on click, Ripple edit (`B`), Track select forward (`A`), Slip (`Y`), Pen (`P`), Hand (`H`), Type (`T`).
- Trim clips via edge handles; ripple delete (`Shift+Del`) closes gaps; add edit at playhead (`Ctrl+K`); magnetic snapping toggle (`S`).
- Clip speed changes (0.1×–4× video, 0.5×–2× audio) with audio pitch preserved via `atempo` chaining.
- Markers (`M`), In/Out points (`I` / `O` in the Source Monitor), insert into sequence (`,`), frame-stepping, SMPTE timecode ruler.
- Track heuristics in the media bin: grid and list views, duration/resolution badges, hover scrubbing, OS drag-and-drop import, drag clips straight onto timeline lanes.

### Color (Lumetri workspace)
- Basic correction sliders: temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, saturation, vignette.
- LUT looks (Cinematic Teal & Orange, Warm Kodak, Film Noir, Vintage Film, Cyberpunk, …).
- RGB curves (master/R/G/B), 3-way color wheels (shadows / midtones / highlights / global), HSL secondary correction, hue-vs-sat and hue-vs-hue curves.
- Before/after split reference view.

### Effects (both preview and export)
- 36 video effects (blur, sharpen, sepia, vintage, posterize, mirror, noise, tint, invert, chroma key, camera shake, slow zoom, vignette, …) and 17 audio effects (high/low-pass, EQ, bass boost, compressor, distortion, delay, reverb, flanger, phaser, pitch shift, time stretch, loudness normalization).
- Per-effect keyframes, effect presets, and a deterministic **Magic Edit** prompt that converts natural language ("make it warm and cinematic") into a real grade/effect/speed plan.

### Audio
- Web Audio API playback engine with per-track gain / pan / analyser graphs and per-clip volume automation keyframes.
- Stereo VU peak meter (−60 dBFS → 0 dBFS) with peak-hold and clip indicators.
- Clip fades (linear / constant-power / exponential curves), pan, Essential Sound tags (dialogue / music / SFX / ambience).

### Graphics & Text
- Essential Graphics workspace: titles, lower thirds, and animated captions rendered as real text clips (`drawtext` on export → actual text in the MP4, not a screenshot).
- Font, size, color, alignment, background boxes, rotation, and per-clip positioning.

### Export (real rendering)
- Server-side FFmpeg 9 multi-track render: per-track video compositing (`scale`, `setpts`, `eq`, `curves`, `colorbalance`, `overlay` with time windows) and audio mixing (`amix=normalize=0`, sample-rate normalization).
- Resolution presets: Match Source, YouTube 1080p, 4K UHD, Vertical 9:16, Mobile 720p.
- Export job progress bar (frame/time position), export queue and history, download or save-to-folder.
- Quality/speed modes: Fastest, Balanced, Best Quality.

### Project management
- Save/open projects as `.prproj.json` (all edits, trims, grades, and fader states intact).
- Autosave: timed snapshots to the browser (`localStorage`) plus server-side version history (20 newest versions per project, restorable).
- Convert to Short: one-click 9:16 conversion with reversible per-clip transforms.
- Relink missing media and collect project files into a folder for transport.

---

## Keyboard shortcuts

| Shortcut | Action |
|:---|:---|
| `Space` | Play / Pause |
| `V` / `C` / `B` / `S` | Selection / Razor / Ripple / Snapping |
| `M` | Add marker at playhead |
| `Ctrl+K` | Add edit (split at playhead) |
| `Del` | Delete selected clip(s) |
| `Shift+Del` | Ripple delete (close gap) |
| `Ctrl+S` | Save project |
| `Ctrl+O` | Open saved project |
| `Ctrl+N` | New sequence |
| `Ctrl+M` | Open export modal |
| `←` / `→` | Step back / forward one frame |
| `Home` / `End` | Jump to sequence start / end |
| `I` / `O` | Mark In / Out (Source Monitor) |
| `?` | Toggle keyboard shortcut overlay |

The in-app overlay (`?`) always shows the current bindings.

---

## Getting started

### Prerequisites

- **Node.js ≥ 22** (tested on Node 24) — runs the dev server, the Express backend, and the TypeScript build.
- **FFmpeg 9.x** — both `ffmpeg` and `ffprobe` must be on your `PATH`. The backend shells out to them for metadata, thumbnails, and rendering. Check with `ffmpeg -version`.
- A desktop-class browser (Chrome/Edge/Firefox). The editor is a desktop, keyboard-and-mouse application.

### Install & run

```bash
git clone <your-fork-url>
cd PremiereProClone
npm install
npm run dev
```

`npm run dev` starts both processes via `concurrently`:

| Process | URL | Purpose |
|:---|:---|:---|
| Frontend (Vite) | `http://localhost:5173` | The editor UI. `/api/*` is proxied to the backend. |
| Backend (Express) | `http://localhost:5001` | Upload, media probing, project persistence, FFmpeg rendering. |

On first boot the backend creates `uploads/` (and generates four built-in sample media clips so you can start editing immediately), `exports/`, and `projects/`.

### Other commands

```bash
npm run server    # backend only
npm run client    # vite dev server only
npm run build     # type-check (tsc -b) + production bundle into dist/
npm run preview   # serve the production build
npm run lint      # oxlint over src/ and server.js
```

### Where your data lives

| Folder | Contents |
|:---|:---|
| `uploads/` | Imported media + auto-generated thumbnails/sample clips |
| `exports/` | Rendered MP4 files |
| `projects/` | `.prproj.json` saves and `autosave/` version history |

All three are local runtime data and are **git-ignored** — the server recreates them automatically.

---

## Architecture

Two processes, no frameworks beyond React and Express:

- **Frontend** — React 19 + TypeScript + Tailwind 4 + Vite. All editor state lives in a single context provider (`src/context/EditorContext.tsx`). The Program Monitor renders the active sequence to an HTML canvas; audio plays through a per-track Web Audio graph.
- **Backend** — a single `server.js` Express app. It accepts the *whole current project state* on `POST /api/render` and compiles it into one FFmpeg `filter_complex` invocation, then streams progress to the client via a job-status endpoint.

Preview and export intentionally implement the same math (transforms, color wheels, curves, text layout) so what you see in the Program Monitor matches what FFmpeg renders. Full details, including the data model and the render pipeline, live in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
PremiereProClone/
├── index.html               # Vite entry point
├── server.js                # Express backend + FFmpeg render pipeline
├── vite.config.ts           # Dev server, port 5173, /api proxy → 5001
├── src/
│   ├── main.tsx / App.tsx   # Bootstrap + panel layout
│   ├── context/EditorContext.tsx   # Global editor state & actions
│   ├── types/editor.ts      # Domain model (Project, Clip, Track, …)
│   ├── components/          # Monitors, timeline, bin, inspector, export
│   ├── components/workspaces/  # Lumetri, Effects, Audio Mixer, Graphics
│   └── utils/               # Audio engine, color math, timecode, magic edit
├── docs/ARCHITECTURE.md     # How it works
├── uploads/ exports/ projects/   # Runtime data (git-ignored)
└── dist/                    # Production build output (git-ignored)
```

---

## Limitations

Honest list of current constraints:

- **Export container is always MP4.** The render pipeline encodes H.264 video + AAC audio. The export modal also lists ProRes/WebM/AVI presets, but the backend does not yet switch codecs or containers — those presets exist in the UI only.
- **Windows font paths in export.** Server-side `drawtext` falls back to `C:\Windows\Fonts\…`, so exported title text spacing matches on Windows; on other platforms the preview is accurate but exported text may need font config tweaks.
- **Single-user, local-first.** No authentication; CORS is open and the upload endpoint accepts files up to 1 GB. Treat it as a workstation-quality local tool, not a hosted multi-user service.
- **Render jobs are in-memory.** The render-history list resets when the backend restarts (rendered files in `exports/` are kept).
- **No automated tests yet.** Quality gates are `tsc -b` and `oxlint`; playtesting is manual.
- **Requires FFmpeg on `PATH`.** The backend spawns `ffmpeg`/`ffprobe` directly; there is no bundled binary.

---

## Contributing

Contributions are welcome. A few things to keep in mind:

1. **Keep preview and export in sync.** If you add or change an effect/grade/speed feature, implement (or match) it in *both* `ProgramMonitor.tsx` (canvas) and the FFmpeg filter chain in `server.js`. A mismatch between what the user sees and what exports is the worst kind of bug here.
2. **Keep the feature list honest.** Only document behavior that exists in the code.
3. Before opening a PR, make sure these pass cleanly (warnings being unchanged is fine):

   ```bash
   npm run lint
   npm run build
   ```

4. Start with the [architecture notes](docs/ARCHITECTURE.md) — they explain where each concern lives so changes stay small.

## License

Released under the [MIT License](LICENSE).
