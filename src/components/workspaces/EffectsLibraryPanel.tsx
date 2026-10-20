import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor } from '../../context/EditorContext';
import type { AppliedEffect, EffectPreset } from '../../types/editor';
import { CINEMATIC_LOOKS, MAGIC_SUGGESTIONS, type MagicEditPlan } from '../../utils/magicEdit';
import { 
  Sparkles, 
  Search, 
  Folder, 
  FolderOpen, 
  Film, 
  Music, 
  Plus, 
  Trash2, 
  Sliders,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  Settings,
  Smartphone,
  Zap,
  Droplets,
  Eye,
  RefreshCw,
  Eraser,
} from 'lucide-react';

interface EffectItem {
  id: string;
  name: string;
  category: 'video' | 'audio';
  type: AppliedEffect['type'];
  defaultValue: number;
  description: string;
  params?: Record<string, number | string | boolean>;
}

const VIDEO_EFFECTS: EffectItem[] = [
  // Stylize & Blur
  { id: 'fx_blur', name: 'Gaussian Blur', category: 'video', type: 'blur', defaultValue: 10, description: 'Softens the image with a gaussian blur.' },
  { id: 'fx_sharpen', name: 'Sharpen', category: 'video', type: 'sharpen', defaultValue: 50, description: 'Increases edge contrast for a crisper look.' },
  { id: 'fx_brightness', name: 'Brightness Boost', category: 'video', type: 'brightness', defaultValue: 25, description: 'Adjusts overall brightness of the clip.' },
  { id: 'fx_contrast', name: 'Contrast', category: 'video', type: 'contrast', defaultValue: 20, description: 'Expands the tonal range for punchier contrast.' },
  { id: 'fx_saturation', name: 'Saturation', category: 'video', type: 'saturation', defaultValue: 30, description: 'Boosts or reduces color intensity.' },
  { id: 'fx_bw', name: 'Black & White', category: 'video', type: 'bw', defaultValue: 100, description: 'Removes all color information.' },
  { id: 'fx_sepia', name: 'Vintage Sepia', category: 'video', type: 'sepia', defaultValue: 80, description: 'Applies a sepia tone for an aged look.' },
  { id: 'fx_invert', name: 'Invert Colors', category: 'video', type: 'invert', defaultValue: 100, description: 'Inverts all color channels.' },
  { id: 'fx_vintage', name: 'Vintage Film', category: 'video', type: 'vintage', defaultValue: 60, description: 'Faded film look with lifted blacks and warm tone.' },

  // New Creative Video Effects (Canvas 2D real-time)
  { id: 'fx_glow', name: 'Glow', category: 'video', type: 'glow', defaultValue: 30, description: 'Adds a blooming glow around bright areas.', params: { intensity: 30 } },
  { id: 'fx_chroma', name: 'Chromatic Aberration', category: 'video', type: 'chromaticAberration', defaultValue: 20, description: 'Separates RGB channels for a lens distortion effect.', params: { offset: 20 } },
  { id: 'fx_rgbSplit', name: 'RGB Split', category: 'video', type: 'rgbSplit', defaultValue: 10, description: 'Offsets red and blue channels independently.', params: { offsetX: 10, offsetY: 10 } },
  { id: 'fx_glitch', name: 'Glitch / Displacement', category: 'video', type: 'glitch', defaultValue: 50, description: 'Random pixel row displacement for a digital glitch look.', params: { intensity: 50 } },
  { id: 'fx_mirrorH', name: 'Mirror Horizontal', category: 'video', type: 'mirror', defaultValue: 100, description: 'Flips the clip horizontally.', params: { axis: 'h' } },
  { id: 'fx_mirrorV', name: 'Mirror Vertical', category: 'video', type: 'mirror', defaultValue: 100, description: 'Flips the clip vertically.', params: { axis: 'v' } },
  { id: 'fx_noise', name: 'Noise / Grain', category: 'video', type: 'noise', defaultValue: 50, description: 'Adds film grain or digital noise texture.', params: { amount: 50, mono: false } },
  { id: 'fx_vignetteCustom', name: 'Vignette (Custom)', category: 'video', type: 'vignetteCustom', defaultValue: 50, description: 'Custom-shaped vignette with feather and roundness controls.', params: { shape: 'circle', feather: 50, roundness: 100 } },
  { id: 'fx_tint', name: 'Tint / Colorize', category: 'video', type: 'tint', defaultValue: 50, description: 'Tints the clip with a color overlay.', params: { tintColor: '#ff0000', amount: 50 } },
  { id: 'fx_posterize', name: 'Posterize', category: 'video', type: 'posterize', defaultValue: 4, description: 'Reduces color levels per channel for a posterized look.', params: { levels: 4 } },
  { id: 'fx_edgeDetect', name: 'Edge Detect', category: 'video', type: 'edgeDetect', defaultValue: 100, description: 'Highlights edges with a sobel-style filter.', params: { threshold: 100 } },
  { id: 'fx_emboss', name: 'Emboss', category: 'video', type: 'emboss', defaultValue: 2, description: 'Raises edges with a 3D emboss effect.', params: { angle: 135, height: 2 } },
  { id: 'fx_lensFlare', name: 'Lens Flare', category: 'video', type: 'lensFlare', defaultValue: 50, description: 'Adds a glowing lens flare at a position.', params: { flareX: 0.5, flareY: 0.5 } },
];

const AUDIO_EFFECTS: EffectItem[] = [
  { id: 'fx_eq', name: 'Parametric Equalizer', category: 'audio', type: 'eq', defaultValue: 50, description: 'Adjusts frequency balance across bands.' },
  { id: 'fx_bass', name: 'Bass Boost (+6dB)', category: 'audio', type: 'bassBoost', defaultValue: 50, description: 'Boosts low-frequency content.' },
  { id: 'fx_reverb', name: 'Studio Reverb', category: 'audio', type: 'reverb', defaultValue: 30, description: 'Adds space and ambience (room/hall/plate).', params: { type: 'room', decay: 30, mix: 30 } },
  { id: 'fx_compressor', name: 'Vocal Compressor', category: 'audio', type: 'compressor', defaultValue: 40, description: 'Controls dynamic range for vocals.' },
  { id: 'fx_delay', name: 'Delay / Echo', category: 'audio', type: 'delay', defaultValue: 30, description: 'Repeats audio with feedback for echo effect.', params: { delayTime: 300, feedback: 30, mix: 30 } },
  { id: 'fx_flanger', name: 'Flanger', category: 'audio', type: 'flanger', defaultValue: 30, description: 'Sweeping comb-filter modulation.', params: { rate: 30, depth: 30, feedback: 30 } },
  { id: 'fx_phaser', name: 'Phaser', category: 'audio', type: 'phaser', defaultValue: 30, description: 'Phase-shift modulation for a whooshing sound.', params: { rate: 30, depth: 30, feedback: 30 } },
  { id: 'fx_distortion', name: 'Distortion / Overdrive', category: 'audio', type: 'distortion', defaultValue: 30, description: 'Adds harmonic saturation and grit.', params: { drive: 30, tone: 50, mix: 30 } },
  { id: 'fx_highPass', name: 'High Pass Filter', category: 'audio', type: 'highPass', defaultValue: 100, description: 'Cuts low frequencies below cutoff.', params: { cutoff: 100, resonance: 0 } },
  { id: 'fx_lowPass', name: 'Low Pass Filter', category: 'audio', type: 'lowPass', defaultValue: 100, description: 'Cuts high frequencies above cutoff.', params: { cutoff: 100, resonance: 0 } },
  { id: 'fx_pitchShift', name: 'Pitch Shift', category: 'audio', type: 'pitchShift', defaultValue: 0, description: 'Shifts pitch in semitones.', params: { semitones: 0, cents: 0 } },
  { id: 'fx_timeStretch', name: 'Time Stretch', category: 'audio', type: 'timeStretch', defaultValue: 100, description: 'Changes duration without affecting pitch.', params: { rate: 100 } },
  { id: 'fx_loudnessNorm', name: 'Loudness Normalization', category: 'audio', type: 'loudnessNorm', defaultValue: -23, description: 'Normalizes to broadcast LUFS target.', params: { targetLUFS: -23, truePeak: -1 } },
];

const EFFECT_PRESETS: EffectPreset[] = [
  {
    id: 'preset_cinematic_look',
    name: 'Cinematic Look',
    category: 'video',
    effects: [
      { name: 'Contrast', type: 'contrast', category: 'video', enabled: true, value: 15 },
      { name: 'Vintage Film', type: 'vintage', category: 'video', enabled: true, value: 40 },
      { name: 'Vignette (Custom)', type: 'vignetteCustom', category: 'video', enabled: true, value: 20 },
    ],
  },
  {
    id: 'preset_vintage_film',
    name: 'Vintage Film',
    category: 'video',
    effects: [
      { name: 'Vintage Sepia', type: 'sepia', category: 'video', enabled: true, value: 40 },
      { name: 'Noise / Grain', type: 'noise', category: 'video', enabled: true, value: 25 },
      { name: 'Vignette (Custom)', type: 'vignetteCustom', category: 'video', enabled: true, value: 30 },
    ],
  },
  {
    id: 'preset_glitch_style',
    name: 'Glitch Style',
    category: 'video',
    effects: [
      { name: 'Chromatic Aberration', type: 'chromaticAberration', category: 'video', enabled: true, value: 15 },
      { name: 'RGB Split', type: 'rgbSplit', category: 'video', enabled: true, value: 8 },
      { name: 'Glitch / Displacement', type: 'glitch', category: 'video', enabled: true, value: 40 },
    ],
  },
  {
    id: 'preset_dialogue_clean',
    name: 'Dialogue Clean',
    category: 'audio',
    effects: [
      { name: 'High Pass Filter', type: 'highPass', category: 'audio', enabled: true, value: 80 },
      { name: 'Vocal Compressor', type: 'compressor', category: 'audio', enabled: true, value: 40 },
      { name: 'Loudness Normalization', type: 'loudnessNorm', category: 'audio', enabled: true, value: -23 },
    ],
  },
];

const EFFECTS_CATALOG = [
  { folder: 'Video Effects (Stylize & Blur)', items: VIDEO_EFFECTS.filter(f => ['blur','sharpen','brightness','contrast','saturation','bw','sepia','invert','vintage'].includes(f.type)) },
  { folder: 'Video Effects (Creative)', items: VIDEO_EFFECTS.filter(f => !['blur','sharpen','brightness','contrast','saturation','bw','sepia','invert','vintage'].includes(f.type)) },
  { folder: 'Audio Effects (Filters & EQ)', items: AUDIO_EFFECTS.filter(f => ['eq','bassBoost','highPass','lowPass','compressor'].includes(f.type)) },
  { folder: 'Audio Effects (Modulation)', items: AUDIO_EFFECTS.filter(f => ['delay','reverb','flanger','phaser','distortion','pitchShift','timeStretch'].includes(f.type)) },
  { folder: 'Audio Effects (Loudness)', items: AUDIO_EFFECTS.filter(f => ['loudnessNorm'].includes(f.type)) },
];

/** Effects that only exist in the live preview (no FFmpeg equivalent yet). */
const PREVIEW_ONLY_TYPES = new Set<EffectItem['type']>([
  'glow', 'glitch', 'lensFlare', 'edgeDetect', 'emboss', 'chromaticAberration', 'rgbSplit',
]);

/** Effects that are only rendered into the exported file. */
const EXPORT_ONLY_TYPES = new Set<EffectItem['type']>([
  'pitchShift', 'timeStretch', 'loudnessNorm',
]);


// Minimal icon components inline since lucide may not export all
const SunIcon = ({ className }: { className?: string }) => (<svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>);
const LayoutIcon = ({ className }: { className?: string }) => (<svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18M9 21V3M21 9h-6M3 9h6M3 15h6M21 15h-6"/></svg>);

const VIDEO_ICONS: Record<string, React.ReactNode> = {
  blur: <Droplets className="w-3 h-3 text-blue-400 shrink-0" />,
  sharpen: <Zap className="w-3 h-3 text-blue-400 shrink-0" />,
  brightness: <SunIcon className="w-3 h-3 text-yellow-400 shrink-0" />,
  bw: <Eye className="w-3 h-3 text-gray-400 shrink-0" />,
  sepia: <Droplets className="w-3 h-3 text-amber-400 shrink-0" />,
  invert: <Eye className="w-3 h-3 text-purple-400 shrink-0" />,
  glow: <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />,
  chromaticAberration: <Film className="w-3 h-3 text-red-400 shrink-0" />,
  rgbSplit: <Film className="w-3 h-3 text-pink-400 shrink-0" />,
  glitch: <RefreshCw className="w-3 h-3 text-rose-400 shrink-0" />,
  mirror: <LayoutIcon className="w-3 h-3 text-cyan-400 shrink-0" />,
  noise: <Droplets className="w-3 h-3 text-gray-400 shrink-0" />,
  vignetteCustom: <Droplets className="w-3 h-3 text-orange-400 shrink-0" />,
  tint: <SunIcon className="w-3 h-3 text-orange-400 shrink-0" />,
  posterize: <LayoutIcon className="w-3 h-3 text-indigo-400 shrink-0" />,
  edgeDetect: <Zap className="w-3 h-3 text-emerald-400 shrink-0" />,
  emboss: <Sliders className="w-3 h-3 text-gray-400 shrink-0" />,
  lensFlare: <SunIcon className="w-3 h-3 text-yellow-400 shrink-0" />,
  vintage: <Film className="w-3 h-3 text-amber-400 shrink-0" />,
};

const AUDIO_ICONS: Record<string, React.ReactNode> = {
  brightness: <SunIcon className="w-3 h-3 text-emerald-400 shrink-0" />,
  reverb: <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />,
  delay: <RefreshCw className="w-3 h-3 text-blue-400 shrink-0" />,
  flanger: <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />,
  phaser: <Sparkles className="w-3 h-3 text-pink-400 shrink-0" />,
  distortion: <Zap className="w-3 h-3 text-rose-400 shrink-0" />,
  highPass: <Sliders className="w-3 h-3 text-cyan-400 shrink-0" />,
  lowPass: <Sliders className="w-3 h-3 text-cyan-400 shrink-0" />,
  pitchShift: <Music className="w-3 h-3 text-purple-400 shrink-0" />,
  timeStretch: <Smartphone className="w-3 h-3 text-gray-400 shrink-0" />,
  loudnessNorm: <Loader2 className="w-3 h-3 text-emerald-400 shrink-0" />,
  vintage: <Music className="w-3 h-3 text-amber-400 shrink-0" />,
};

/** ✨ AI Magic Edit — type what you want, the editor applies it. */
const MagicEditCard: React.FC = () => {
  const { project, selectedClipId, applyMagicEdit, removeMagicLook, hasMagicLook } = useEditor();
  const [prompt, setPrompt] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const hasMediaClips = project.clips.some(c => (c.type === 'video' || c.type === 'image') && !c.textProperties);

  const runMagicEdit = (text: string) => {
    if (!text.trim()) return;
    if (!hasMediaClips) {
      setError('No video/image clips on the timeline yet. Add a clip first.');
      return;
    }
    setBusy(true);
    setError('');
    // Small delay so the "thinking" state is visible — the plan itself is instant.
    setTimeout(() => {
      try {
        const plan: MagicEditPlan = applyMagicEdit(text, selectedClipId || undefined);
        setResult(plan.labels);
        const targetLabel = selectedClipId
          ? 'selected clip'
          : `${project.clips.filter(c => (c.type === 'video' || c.type === 'image') && !c.textProperties).length} media clips`;
        setResult([...plan.labels, `→ applied to ${targetLabel}`]);
      } catch {
        setError('Something went wrong applying that prompt.');
      } finally {
        setBusy(false);
      }
    }, 350);
  };

  const targetLabel = selectedClipId
    ? 'selected clip'
    : `${project.clips.filter(c => (c.type === 'video' || c.type === 'image') && !c.textProperties).length} media clips`;
  const lookActive = hasMagicLook(selectedClipId || undefined);

  const removeLook = () => {
    try {
      const count = removeMagicLook(selectedClipId || undefined);
      if (count === 0) {
        setError('No video/image clips to clean up yet.');
        return;
      }
      setResult([`Cinematic look removed from ${count === 1 ? targetLabel : `${count} media clips`}`]);
      setPrompt('');
    } catch {
      setError('Something went wrong removing the look.');
    }
  };

  return (
    <div className="px-3 py-2 border-b border-[#2b2b2b] bg-gradient-to-r from-[#20242a] to-[#1e1e1e]">
      <div className="flex items-center space-x-1.5 mb-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-semibold text-white text-xs">AI Magic Edit</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold uppercase">Beta</span>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto p-0.5 rounded text-gray-400 hover:text-white hover:bg-[#2b2b2b]"
          title={collapsed ? 'Expand Magic Edit' : 'Collapse Magic Edit'}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {collapsed ? (
        <p className="text-[10px] text-gray-600">
          Collapsed — click ▸ to reopen the prompt and cinematic looks.
        </p>
      ) : (<>
      <p className="text-[10px] text-gray-500 mb-1.5">
        Describe the look: “cinematic teal &amp; orange, subtle shake, slow zoom…”
      </p>
      <textarea
        value={prompt}
        onChange={e => { setPrompt(e.target.value); setError(''); }}
        rows={2}
        placeholder="Type an editing instruction…"
        className="w-full bg-[#141414] border border-[#333] rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-amber-500 resize-none"
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            runMagicEdit(prompt);
          }
        }}
      />
      <div className="flex flex-wrap gap-1 mt-1.5">
        <button
          onClick={() => runMagicEdit(prompt)}
          disabled={busy || !prompt.trim()}
          className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition ${
            busy || !prompt.trim()
              ? 'bg-[#2a2a2a] text-gray-500 border border-[#333]'
              : 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400'
          }`}
        >
          {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {busy ? 'Applying…' : 'Apply'}
        </button>
        {MAGIC_SUGGESTIONS.slice(0, 2).map(s => (
          <button
            key={s}
            onClick={() => setPrompt(s)}
            className="px-2 py-1 rounded text-[9px] text-gray-400 bg-[#242424] border border-[#333] hover:border-amber-500 hover:text-amber-300 transition truncate max-w-[150px]"
            title={s}
          >
            {s.slice(0, 28)}…
          </button>
        ))}
      </div>

      {result.length > 0 && !error && (
        <div className="mt-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-600/30 text-[10px] text-emerald-300">
          ✓ {result.join(' · ')}
        </div>
      )}
      {error && (
        <div className="mt-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-600/30 text-[10px] text-red-300">
          {error}
        </div>
      )}

      {/* One-click cinematic looks */}
      <div className="flex items-center justify-between mt-2 mb-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cinematic Looks</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {CINEMATIC_LOOKS.map(look => (
          <button
            key={look.name}
            onClick={() => { setPrompt(look.prompt); runMagicEdit(look.prompt); }}
            disabled={busy || !hasMediaClips}
            className="flex items-center justify-center gap-1 py-1 rounded bg-[#242424] border border-[#333] hover:border-amber-500/60 hover:bg-[#2a2620] text-[10px] text-gray-200 transition disabled:opacity-40"
            title={look.prompt}
          >
            <span>{look.emoji}</span> {look.name}
          </button>
        ))}
      </div>

      {/* Remove the applied cinematic look */}
      <button
        onClick={removeLook}
        disabled={busy || !hasMediaClips || !lookActive}
        title={lookActive
          ? 'Reset color grade, look effects and speed back to normal'
          : 'No cinematic look applied on the target clip yet'}
        className={`mt-1.5 w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 transition border ${
          busy || !hasMediaClips || !lookActive
            ? 'bg-[#2a2a2a] text-gray-500 border-[#333] cursor-not-allowed'
            : 'bg-red-950/50 hover:bg-red-700 text-red-300 hover:text-white border-red-800'
        }`}
      >
        <Eraser className="w-3.5 h-3.5" />
        Remove Look {lookActive ? `from ${targetLabel}` : '(none applied)'}
      </button>
      {lookActive && (
        <p className="text-[9px] text-gray-500 mt-1">
          A look is active — "Remove Look" resets colors, look effects and speed to normal.
        </p>
      )}
      </>)}
    </div>
  );
};

export const EffectsLibraryPanel: React.FC = () => {
  const {
    project,
    selectedClipId,
    setSelectedClipId,
    playhead,
    addClipEffect,
    toggleClipEffect,
    removeClipEffect,
    updateClipEffectValue,
    updateClipEffectParam,
    isShortFormat,
    removeShortFormat,
  } = useEditor();

  const [search, setSearch] = useState<string>('');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    'Video Effects (Stylize & Blur)': true,
    'Video Effects (Creative)': false,
    'Audio Effects (Filters & EQ)': true,
    'Audio Effects (Modulation)': false,
    'Audio Effects (Loudness)': false,
  });
  const [activeTab, setActiveTab] = useState<'catalog' | 'applied' | 'presets'>('catalog');
  const [presetModal, setPresetModal] = useState<boolean>(false);
  const [savingPreset, setSavingPreset] = useState<boolean>(false);
  const [presetName, setPresetName] = useState<string>('');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const flashTimer = useRef<number | null>(null);

  const showFlash = useCallback((kind: 'ok' | 'err', text: string) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setFlash({ kind, text });
    flashTimer.current = window.setTimeout(() => setFlash(null), 4000);
  }, []);

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  // Target resolution: a selected clip wins; otherwise fall back to the clip
  // under the playhead (topmost track) so Apply never silently does nothing.
  const selectedClip = project.clips.find(c => c.id === selectedClipId) || null;
  const clipUnderPlayhead = project.clips
    .filter(c => playhead >= c.startTime && playhead < c.startTime + c.duration)
    .sort((a, b) => {
      const rank = (t: string) => (t === 'video' ? 2 : t === 'image' ? 1 : 0);
      const typeDiff = rank(b.type) - rank(a.type);
      if (typeDiff !== 0) return typeDiff;
      return parseInt(b.trackId.replace(/\D/g, '') || '0', 10) - parseInt(a.trackId.replace(/\D/g, '') || '0', 10);
    })[0] || null;

  const targetClip = selectedClip || clipUnderPlayhead;
  const targetIsAuto = !selectedClip && !!clipUnderPlayhead;
  const targetEffects = targetClip?.appliedEffects || [];
  const activeEffects = targetEffects;

  const canAccept = (category: 'video' | 'audio', clip = targetClip): boolean => {
    if (!clip) return false;
    if (category === 'video') return clip.type === 'video' || (clip.type === 'image' && !clip.textProperties);
    // Audio effects need real audio: audio clips or video clips.
    return clip.type === 'audio' || clip.type === 'video';
  };

  const toggleFolder = (name: string) => {
    setOpenFolders(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleApply = useCallback((item: EffectItem) => {
    if (!targetClip) {
      showFlash('err', 'Select a clip on the timeline first.');
      return;
    }
    if (!canAccept(item.category)) {
      showFlash('err', item.category === 'video'
        ? `"${item.name}" is a video effect — select a video or image clip.`
        : `"${item.name}" is an audio effect — select an audio or video clip.`);
      return;
    }    addClipEffect(targetClip.id, {
      name: item.name,
      category: item.category,
      type: item.type,
      enabled: true,
      value: item.defaultValue,
      params: item.params ? { ...item.params } : undefined,
    });
    showFlash('ok', `${item.name} applied to ${targetClip.name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetClip, addClipEffect, showFlash]);

  const handleSavePreset = useCallback(() => {
    if (!targetClip || !activeEffects.length) return;
    setSavingPreset(true);
    // In a full build this would save to localStorage/server
    setPresetModal(false);
    setSavingPreset(false);
  }, [targetClip, activeEffects.length]);

  const handleLoadPreset = useCallback((preset: EffectPreset) => {
    if (!targetClip) {
      showFlash('err', 'Select a clip on the timeline first.');
      return;
    }
    let applied = 0;
    for (const fx of preset.effects) {
      if (!canAccept(fx.category)) continue;
      addClipEffect(targetClip.id, {
        name: fx.name,
        category: fx.category,
        type: fx.type as AppliedEffect['type'],
        enabled: fx.enabled,
        value: typeof fx.value === 'number' ? fx.value : 100,
        params: fx.params as Record<string, number | string | boolean> | undefined,
      });
      applied++;
    }
    if (applied === 0) {
      showFlash('err', `"${preset.name}" has no effects this clip can use.`);
    } else {
      showFlash('ok', `${preset.name} applied (${applied} effect${applied > 1 ? 's' : ''}) to ${targetClip.name}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetClip, addClipEffect, showFlash]);

  const filteredItems = (group: { folder: string; items: EffectItem[] }) =>
    group.items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));

  const isOpen = (name: string) => openFolders[name] || Boolean(search);

  /** Slider ranges + units so every effect gets a meaningful control. */
  const effectRange = (fx: AppliedEffect): { min: number; max: number; step: number; unit: string } => {
    switch (fx.type) {
      case 'highPass': return { min: 60, max: 220, step: 5, unit: 'Hz' };
      case 'lowPass': return { min: 9000, max: 20000, step: 250, unit: 'Hz' };
      case 'loudnessNorm': return { min: -40, max: -5, step: 1, unit: 'LUFS' };
      case 'posterize': return { min: 2, max: 16, step: 1, unit: 'lv' };
      case 'pitchShift': return { min: -12, max: 12, step: 1, unit: 'st' };
      case 'timeStretch': return { min: 50, max: 200, step: 5, unit: '%' };
      case 'cameraShake': return { min: 0, max: 100, step: 5, unit: '%' };
      case 'slowZoom': return { min: 0, max: 50, step: 1, unit: '%' };
      case 'blur': return { min: 0, max: 100, step: 1, unit: '%' };
      case 'chromaKey': return { min: 0, max: 100, step: 1, unit: '%' };
      case 'glitch': return { min: 0, max: 100, step: 5, unit: '%' };
      case 'noise': return { min: 0, max: 100, step: 5, unit: '%' };
      case 'tint': return { min: 0, max: 100, step: 5, unit: '%' };
      case 'lensFlare': return { min: 0, max: 100, step: 5, unit: '%' };
      default: return { min: 0, max: 100, step: 1, unit: '%' };
    }
  };

  const PARAM_META: Record<string, { label: string; min: number; max: number; step: number; unit: string }> = {
    delayTime: { label: 'Delay time', min: 20, max: 1500, step: 10, unit: 'ms' },
    feedback: { label: 'Feedback', min: 0, max: 90, step: 5, unit: '%' },
    mix: { label: 'Wet mix', min: 0, max: 100, step: 5, unit: '%' },
    rate: { label: 'Rate', min: 1, max: 100, step: 1, unit: '%' },
    depth: { label: 'Depth', min: 0, max: 100, step: 5, unit: '%' },
    drive: { label: 'Drive', min: 0, max: 100, step: 5, unit: '%' },
    tone: { label: 'Tone', min: 0, max: 100, step: 5, unit: '%' },
    cutoff: { label: 'Cutoff', min: 20, max: 20000, step: 10, unit: 'Hz' },
    resonance: { label: 'Resonance', min: 0, max: 20, step: 1, unit: '' },
    semitones: { label: 'Semitones', min: -12, max: 12, step: 1, unit: 'st' },
    cents: { label: 'Cents', min: -100, max: 100, step: 5, unit: 'ct' },
    targetLUFS: { label: 'Target loudness', min: -40, max: -5, step: 1, unit: 'LUFS' },
    truePeak: { label: 'True peak', min: -6, max: 0, step: 0.5, unit: 'dB' },
    intensity: { label: 'Intensity', min: 0, max: 100, step: 5, unit: '%' },
    offset: { label: 'Offset', min: 0, max: 100, step: 5, unit: 'px' },
    offsetX: { label: 'Horizontal offset', min: 0, max: 50, step: 1, unit: 'px' },
    offsetY: { label: 'Vertical offset', min: 0, max: 50, step: 1, unit: 'px' },
    amount: { label: 'Amount', min: 0, max: 100, step: 5, unit: '%' },
    levels: { label: 'Levels', min: 2, max: 16, step: 1, unit: '' },
    threshold: { label: 'Threshold', min: 0, max: 100, step: 5, unit: '%' },
    angle: { label: 'Angle', min: 0, max: 360, step: 15, unit: '°' },
    height: { label: 'Height', min: 1, max: 10, step: 1, unit: 'px' },
    flareX: { label: 'Flare X', min: 0, max: 100, step: 5, unit: '%' },
    flareY: { label: 'Flare Y', min: 0, max: 100, step: 5, unit: '%' },
    decay: { label: 'Decay', min: 0, max: 100, step: 5, unit: '%' },
  };

  const paramControl = (fx: AppliedEffect) => {
    const params = fx.params;
    if (!params) return null;
    const keys = Object.keys(params).filter(k => typeof params[k] === 'number');
    if (keys.length === 0) return null;
    return (
      <div className="space-y-1.5 pt-2 border-t border-[#333] mt-2">
        {keys.map(key => {
          const meta = PARAM_META[key] || { label: key, min: 0, max: 100, step: 1, unit: '' };
          const raw = params[key];
          const val = typeof raw === 'number' ? raw : 0;
          const shown = key === 'flareX' || key === 'flareY' ? Math.round(val * 100) : val;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-[92px] shrink-0 truncate" title={meta.label}>{meta.label}</span>
              <input
                type="range"
                min={meta.min}
                max={meta.max}
                step={meta.step}
                value={key === 'flareX' || key === 'flareY' ? shown : val}
                onChange={e => {
                  if (!targetClip) return;
                  const next = parseFloat(e.target.value);
                  updateClipEffectParam(targetClip.id, fx.id, key, key === 'flareX' || key === 'flareY' ? next / 100 : next);
                }}
                className="flex-1 accent-amber-500 h-1 bg-[#141414] rounded cursor-pointer min-w-0"
              />
              <span className="font-mono text-[10px] text-gray-400 w-14 text-right shrink-0">
                {key === 'flareX' || key === 'flareY' ? shown : val}{meta.unit}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#2d2d2d] select-none text-xs text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#252525] border-b border-[#2d2d2d]">
        <div className="flex items-center space-x-1">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-white">Effects Library</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('presets')}
            className={`p-1 rounded transition ${activeTab === 'presets' ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50' : 'text-gray-400 hover:text-white'}`}
            title="Effect Presets"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable body: search + Magic Edit + tabs + lists share ONE scroll
          container so the panel always scrolls, even when the panel is short. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Search Bar */}
      <div className="px-3 py-2 bg-[#202020] border-b border-[#2b2b2b] flex items-center sticky top-0 z-30">
        <div className="relative w-full flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search effects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141414] border border-[#333] rounded pl-7 pr-2 py-1 text-xs text-white placeholder-gray-500 outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* AI Magic Edit */}
      <MagicEditCard />

      {/* Target clip banner — makes it obvious where Apply sends effects */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 text-[10px] ${
        targetClip
          ? targetIsAuto
            ? 'bg-blue-950/30 border-blue-900/40 text-blue-300'
            : 'bg-[#202020] border-[#2b2b2b] text-gray-400'
          : 'bg-red-950/30 border-red-900/40 text-red-300'
      }`}>
        {targetClip ? (
          <>
            <span className="flex items-center gap-1.5 min-w-0">
              <Film className="w-3 h-3 shrink-0" />
              <span className="truncate">
                Applying to <span className="font-semibold text-white">{targetClip.name}</span>
              </span>
              <span className={`shrink-0 px-1 rounded text-[9px] uppercase font-bold ${
                targetClip.type === 'video' ? 'bg-blue-900/50 text-blue-300'
                  : targetClip.type === 'image' ? 'bg-purple-900/50 text-purple-300'
                    : 'bg-emerald-900/50 text-emerald-300'
              }`}>{targetClip.type}</span>
            </span>
            <span className={`shrink-0 text-[9px] uppercase font-bold ${targetIsAuto ? 'text-blue-400' : 'text-gray-500'}`}>
              {targetIsAuto ? 'from playhead' : 'selected'}
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <Film className="w-3 h-3 shrink-0" />
            No clip selected — click a clip in the timeline (or move the playhead over one).
          </span>
        )}
      </div>

      {/* Apply confirmation / error */}
      {flash && (
        <div className={`px-3 py-1.5 border-b text-[10px] flex items-center justify-between gap-2 ${
          flash.kind === 'ok'
            ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-300'
            : 'bg-red-950/40 border-red-900/50 text-red-300'
        }`}>
          <span className="truncate">{flash.kind === 'ok' ? '✓ ' : '⚠ '}{flash.text}</span>
          {flash.kind === 'ok' && (
            <button
              onClick={() => setActiveTab('applied')}
              className="shrink-0 underline hover:text-white font-semibold"
            >
              View
            </button>
          )}
        </div>
      )}

      {/* Main Content Split: Tabs */}
      <div className="flex flex-col">
        {/* Tab Strip */}
        <div className="flex h-7 bg-[#252525] border-b border-[#2d2d2d] text-xs shrink-0 sticky top-[37px] z-20">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 font-medium border-b-2 transition ${
              activeTab === 'catalog' ? 'border-[#1473e6] text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Browse Effects
          </button>
          <button
            onClick={() => setActiveTab('applied')}
            className={`flex-1 font-medium border-b-2 transition ${
              activeTab === 'applied' ? 'border-[#1473e6] text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Applied Effects ({activeEffects.length})
          </button>
        </div>

        {/* Catalog View */}
        {activeTab === 'catalog' && (
          <div className="p-2 space-y-1">
            {EFFECTS_CATALOG.map(group => {
              const items = filteredItems(group);
              if (search && items.length === 0) return null;
              const open = isOpen(group.folder);
              return (
                <div key={group.folder} className="border border-[#2d2d2d] rounded bg-[#232323] overflow-hidden">
                  <button
                    onClick={() => toggleFolder(group.folder)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#282828] hover:bg-[#2e2e2e] text-left transition font-medium text-gray-300 hover:text-white"
                  >
                    <span className="flex items-center space-x-1.5 truncate">
                      {open ? <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span className="truncate">{group.folder}</span>
                      <span className="text-[9px] text-gray-500 font-mono">({items.length})</span>
                    </span>
                    {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                  </button>

                  {open && (
                    <div className="p-1 space-y-1 bg-[#1c1c1c]">
                      {items.map(item => {
                        const compatible = canAccept(item.category);
                        const appliedCount = targetEffects.filter(fx => fx.type === item.type && fx.category === item.category).length;
                        return (
                          <div key={item.id} className="px-2.5 py-1.5 hover:bg-[#272727] rounded group transition">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center space-x-2 truncate min-w-0">
                                {item.category === 'video' ? (
                                  (VIDEO_ICONS[item.type] || <Film className="w-3 h-3 text-blue-400 shrink-0" />)
                                ) : (
                                  (AUDIO_ICONS[item.type] || <Music className="w-3 h-3 text-emerald-400 shrink-0" />)
                                )}
                                <span className={`truncate ${compatible ? 'text-gray-300 group-hover:text-white' : 'text-gray-500'}`}>{item.name}</span>
                                {PREVIEW_ONLY_TYPES.has(item.type) && (
                                  <span className="shrink-0 px-1 rounded bg-purple-900/40 text-purple-300 text-[8px] font-bold uppercase" title="Live preview only — not rendered into the exported file yet">
                                    preview
                                  </span>
                                )}
                                {EXPORT_ONLY_TYPES.has(item.type) && (
                                  <span className="shrink-0 px-1 rounded bg-sky-900/40 text-sky-300 text-[8px] font-bold uppercase" title="Applied when you export — not audible in live preview">
                                    export
                                  </span>
                                )}
                                {appliedCount > 0 && (
                                  <span className="shrink-0 px-1 rounded bg-emerald-900/50 text-emerald-300 text-[9px] font-bold" title={`${appliedCount} instance(s) on this clip`}>
                                    ✓{appliedCount > 1 ? ` ×${appliedCount}` : ''}
                                  </span>
                                )}
                              </div>

                              <button
                                onClick={() => handleApply(item)}
                                disabled={!targetClip || !compatible}
                                title={
                                  !targetClip ? 'Select a clip (or move the playhead over one) first'
                                    : !compatible
                                      ? `${item.category === 'video' ? 'Video' : 'Audio'} effects can't be applied to ${targetClip.type === 'audio' || targetClip.type === 'image' ? 'an' : 'a'} ${targetClip.type} clip`
                                      : `Apply ${item.name} to ${targetClip.name}`
                                }
                                className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1 transition shadow-xs ${
                                  !targetClip || !compatible
                                    ? 'bg-[#2a2a2a] text-gray-500 border border-[#333] cursor-not-allowed'
                                    : 'bg-[#1473e6] hover:bg-[#2680eb] text-white'
                                }`}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Apply</span>
                              </button>
                            </div>
                            <p className="text-[9px] text-gray-600 leading-tight mt-0.5 group-hover:text-gray-500">{item.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {search && EFFECTS_CATALOG.every(g => filteredItems(g).length === 0) && (
              <div className="flex-1 flex items-center justify-center text-center p-8 text-gray-500">
                No effects match your search.
              </div>
            )}
          </div>
        )}

        {/* Presets View */}
        {activeTab === 'presets' && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">Saved Effect Presets</span>
              <button
                onClick={() => { setPresetName(''); setPresetModal(true); }}
                className="px-2 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
            <div className="space-y-1">
              {EFFECT_PRESETS.map(preset => (
                <div key={preset.id} className="bg-[#242424] border border-[#333] rounded p-2 hover:border-blue-500 cursor-pointer transition group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-white truncate">{preset.name}</span>
                    <span className="text-[9px] text-gray-500 capitalize">{preset.category}</span>
                  </div>
                  <div className="flex gap-1">
                    {preset.effects.map((fx, _i) => (
                      <span key={_i} className="px-1 py-0.5 rounded bg-[#181818] border border-[#333] text-[9px] text-gray-300">
                        {fx.name}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleLoadPreset(preset)}
                    className="mt-1 w-full px-2 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!targetClip}
                    title={targetClip ? `Apply preset to ${targetClip.name}` : 'Select a clip first'}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Apply Preset
                  </button>
                </div>
              ))}
              {EFFECT_PRESETS.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No presets saved yet. Create one from the Applied Effects panel.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Applied Effects Inspector */}
        {activeTab === 'applied' && (
          <div className="bg-[#181818] p-3 flex flex-col">
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#2b2b2b]">
              <span className="font-semibold text-gray-300 flex items-center">
                <Sliders className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                Applied Effects ({activeEffects.length})
              </span>
              <div className="flex items-center gap-2 min-w-0">
                {targetClip && (
                  <span className="font-mono text-[10px] text-cyan-400 truncate max-w-[130px]" title={targetClip.name}>{targetClip.name}</span>
                )}
                {activeEffects.length > 0 && (
                  <button
                    onClick={() => {
                      if (!targetClip) return;
                      for (const fx of [...targetEffects]) removeClipEffect(targetClip.id, fx.id);
                      showFlash('ok', `Removed all effects from ${targetClip.name}`);
                    }}
                    className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[#181818] border border-[#333] text-gray-400 hover:text-red-400 hover:border-red-500/50 transition"
                    title="Remove every effect from this clip"
                  >
                    Remove all
                  </button>
                )}
              </div>
            </div>

            {targetClip && (
              <div className="mb-2 flex items-center gap-2 text-[9px] text-gray-500">
                <span className={`px-1 rounded uppercase font-bold ${
                  targetClip.type === 'video' ? 'bg-blue-900/50 text-blue-300'
                    : targetClip.type === 'image' ? 'bg-purple-900/50 text-purple-300'
                      : 'bg-emerald-900/50 text-emerald-300'
                }`}>{targetClip.type}</span>
                <span>{activeEffects.filter(fx => fx.category === 'video').length} video</span>
                <span>·</span>
                <span>{activeEffects.filter(fx => fx.category === 'audio').length} audio</span>
                {targetIsAuto && <span className="ml-auto text-blue-400">auto-targeted from playhead</span>}
              </div>
            )}

            {/* Sequence-wide Short format — removable like an applied effect */}
            {isShortFormat && (
              <div className="bg-[#241a26] border border-pink-900/50 rounded p-2 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-white min-w-0">
                    <Smartphone className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="truncate">Short Format (9:16)</span>
                    <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-pink-900/50 text-pink-300 uppercase font-bold">sequence</span>
                  </span>
                  <button
                    onClick={removeShortFormat}
                    title="Remove the 9:16 conversion and restore the original sequence size and clip framing"
                    className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/50 hover:bg-red-700 text-red-300 hover:text-white border border-red-800 transition"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-[9px] text-gray-500 mt-1">
                  Vertical {project.width}×{project.height} sequence with cover-fit zoom on all video/image clips.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {!targetClip ? (
                <div className="text-center py-4 text-gray-500 text-[11px]">
                  No clip selected and no clip under the playhead. Click a clip in the timeline to inspect and manage its effects.
                </div>
              ) : activeEffects.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-[11px]">
                  <p>No effects applied to <span className="text-gray-300">{targetClip.name}</span> yet.</p>
                  <button
                    onClick={() => setActiveTab('catalog')}
                    className="mt-2 px-2.5 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold"
                  >
                    Browse Effects
                  </button>
                </div>
              ) : (
                activeEffects.map(fx => {
                  const range = effectRange(fx);
                  return (
                  <div key={fx.id} className="bg-[#222] border border-[#333] rounded p-2 text-xs overflow-hidden">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <label className="flex items-center space-x-2 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={fx.enabled}
                          onChange={() => toggleClipEffect(targetClip.id, fx.id)}
                          className="accent-blue-500 rounded shrink-0"
                        />
                        <span className={`font-semibold truncate ${fx.enabled ? 'text-white' : 'text-gray-500 line-through'}`}>
                          {fx.name}
                        </span>
                        <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded uppercase font-bold ${
                          fx.category === 'audio' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-blue-900/40 text-blue-300'
                        }`}>{fx.category}</span>
                        {PREVIEW_ONLY_TYPES.has(fx.type) && (
                          <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-purple-900/40 text-purple-300 uppercase font-bold" title="Not rendered into exports yet">preview</span>
                        )}
                        {EXPORT_ONLY_TYPES.has(fx.type) && (
                          <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-sky-900/40 text-sky-300 uppercase font-bold" title="Applied on export only">export</span>
                        )}
                      </label>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => {
                            // Open keyframe editor (placeholder)
                          }}
                          className="p-1 text-gray-400 hover:text-blue-400 rounded"
                          title="Edit Keyframes"
                        >
                          <Settings className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeClipEffect(targetClip.id, fx.id)}
                          className="p-1 text-gray-400 hover:text-red-400 rounded"
                          title="Remove effect"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Intensity slider with effect-appropriate range */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-400 w-[92px] shrink-0">Amount</span>
                      <input
                        type="range"
                        min={range.min}
                        max={range.max}
                        step={range.step}
                        value={Math.max(range.min, Math.min(range.max, fx.value))}
                        onChange={e => updateClipEffectValue(targetClip.id, fx.id, parseFloat(e.target.value))}
                        className="flex-1 accent-amber-500 h-1 bg-[#141414] rounded cursor-pointer min-w-0"
                      />
                      <span className="font-mono text-[10px] text-gray-400 w-14 text-right shrink-0">{fx.value}{range.unit}</span>
                    </div>

                    {/* Params */}
                    {paramControl(fx)}

                    {/* Keyframes indicator */}
                    {fx.keyframes && fx.keyframes.length > 0 && (
                      <div className="flex items-center space-x-1 mt-1 pt-1 border-t border-[#333]">
                        <span className="text-[9px] text-emerald-400 font-mono">
                          {fx.keyframes.length} keyframe{fx.keyframes.length > 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={() => {
                            // Open keyframe graph editor (placeholder)
                          }}
                          className="px-1 py-0.5 bg-[#1473e6]/30 text-blue-400 rounded text-[9px] hover:bg-blue-600/50"
                        >
                          Edit Graph
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>

            {/* Other clips that already have effects — click to jump to them so
                applied effects never look like they vanished. */}
            {(() => {
              const others = project.clips.filter(c => c.id !== targetClip?.id && (c.appliedEffects?.length ?? 0) > 0);
              if (others.length === 0) return null;
              return (
                <div className="mt-3 pt-2 border-t border-[#2b2b2b]">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">
                    Effects on other clips ({others.length})
                  </p>
                  <div className="space-y-0.5">
                    {others.slice(0, 8).map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedClipId(c.id)}
                        className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-[#252525] text-left transition group"
                        title={`Select ${c.name}`}
                      >
                        <span className="truncate text-[10px] text-gray-400 group-hover:text-white">{c.name}</span>
                        <span className="shrink-0 text-[9px] text-amber-400 font-mono">{c.appliedEffects?.length} fx</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      </div>

      {/* Save Preset Modal */}
      {presetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-[#202020] border border-[#3e3e3e] rounded-lg shadow-2xl w-full max-w-sm overflow-hidden text-xs text-gray-200">
            <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2d2d2d]">
              <span className="font-semibold text-white">Save Effect Preset</span>
              <button onClick={() => setPresetModal(false)} className="text-gray-400 hover:text-white">
                <XMark className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-gray-400 block mb-1">Preset Name</label>
                <input
                  type="text"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-3 py-1.5 text-white font-mono outline-none focus:border-blue-500"
                />
              </div>
              <div className="text-[10px] text-gray-500">
                Preset will be saved with all effect parameters from the selected clip.
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 px-4 py-3 bg-[#181818] border-t border-[#2d2d2d]">
              <button onClick={() => setPresetModal(false)} className="px-3 py-1.5 rounded hover:bg-[#333] text-gray-300">
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!presetName || savingPreset}
                className={`px-4 py-1.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-medium shadow disabled:opacity-50`}
              >
                {savingPreset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const XMark = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
