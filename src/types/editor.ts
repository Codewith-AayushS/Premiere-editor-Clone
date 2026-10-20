export type MediaType = 'video' | 'audio' | 'image';

export type ActiveTool =
  | 'select'       // V - Selection tool
  | 'trackSelect'  // A - Track select forward
  | 'ripple'       // B - Ripple edit
  | 'razor'        // C - Razor split
  | 'slip'         // Y - Slip tool
  | 'pen'          // P - Pen keyframing
  | 'hand'         // H - Hand scroll/pan
  | 'type';        // T - Type tool

export type WorkspaceTab =
  | 'editing'
  | 'color'
  | 'effects'
  | 'audio'
  | 'graphics'
  | 'export';

export interface MediaAsset {
  id: string;
  name: string;
  filename: string;
  url: string;
  type: MediaType;
  duration: number; // in seconds
  width?: number;
  height?: number;
  fps?: number;
  thumbnail?: string | null;
  size?: number;
}

export interface TransformProperties {
  x: number; // offset in px
  y: number;
  scale: number; // 1.0 = 100%
  rotation: number; // degrees
}

export type AudioClipType = 'dialogue' | 'music' | 'sfx' | 'ambience';

export type AudioTransitionType = 'constant-power' | 'constant-gain' | 'exponential';

/** Volume automation point, relative to the clip's start time. */
export interface VolumeKeyframe {
  id: string;
  time: number;   // seconds from clip start
  volume: number; // 0.0 - 2.0 multiplier (1.0 = 100%)
}

export interface ColorGrade {
  temperature: number; // -100 to 100 (blue to amber)
  tint: number;        // -100 to 100 (green to magenta)
  exposure: number;    // -3 to +3 EV
  contrast: number;    // -100 to 100
  highlights: number;  // -100 to 100
  shadows: number;     // -100 to 100
  whites: number;      // -100 to 100
  blacks: number;      // -100 to 100
  saturation: number;  // 0 to 200% (default: 100)
  vignette: number;    // 0 to 100%
  lut: string;         // 'None' | 'Cinematic Teal & Orange' | 'Warm Kodak' | 'Monochrome' | 'Vintage Film'
}

export interface AppliedEffect {
  id: string;
  type:
    | 'blur'
    | 'sharpen'
    | 'brightness'
    | 'contrast'
    | 'saturation'
    | 'bw'
    | 'sepia'
    | 'invert'
    | 'vintage'
    | 'glow'
    | 'chromaticAberration'
    | 'rgbSplit'
    | 'glitch'
    | 'mirror'
    | 'noise'
    | 'vignetteCustom'
    | 'tint'
    | 'posterize'
    | 'edgeDetect'
    | 'emboss'
    | 'lensFlare'
    | 'chromaKey'
    | 'cameraShake'
    | 'slowZoom'
    | 'delay'
    | 'reverb'
    | 'flanger'
    | 'phaser'
    | 'distortion'
    | 'highPass'
    | 'lowPass'
    | 'eq'
    | 'bassBoost'
    | 'compressor'
    | 'pitchShift'
    | 'timeStretch'
    | 'loudnessNorm';
  name: string;
  category: 'video' | 'audio';
  enabled: boolean;
  value: number; // percentage or px
  // Per-effect params stored as JSON string for extensibility
  params?: Record<string, number | string | boolean>;
  keyframes?: EffectKeyframe[];
}

export interface EffectKeyframe {
  id: string;
  time: number; // seconds in clip
  value: number;
  interpolation: 'linear' | 'bezier' | 'step';
}

export interface EffectPreset {
  id: string;
  name: string;
  category: 'video' | 'audio';
  effects: Omit<AppliedEffect, 'id' | 'keyframes'>[];
}

export interface TextProperties {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  align: 'left' | 'center' | 'right';
  isTemplate?: boolean;
  templateName?: string;
  /** Marks clips created by the Animated Captions tool so they can be positioned together. */
  isCaption?: boolean;
  /** Groups the captions created in a single batch. */
  captionGroupId?: string;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  type: MediaType;
  color: string; // Premiere label color hex
  startTime: number; // Position on timeline in seconds
  duration: number; // Duration on timeline in seconds
  inPoint: number; // Source start trim point in seconds
  outPoint: number; // Source end trim point in seconds
  speed: number; // 1.0 = 100%
  volume: number; // 0 to 2.0 (1.0 = 0dB)
  muted: boolean;
  fadeIn?: number;  // audio fade-in length in seconds
  fadeOut?: number; // audio fade-out length in seconds
  opacity: number; // 0.0 to 1.0
  transform: TransformProperties;
  /** Per-clip audio pan, -1 (left) to +1 (right). */
  pan?: number;
  /** Volume automation points for this clip's audio. */
  volumeKeyframes?: VolumeKeyframe[];
  /** Essential Sound tag. */
  audioType?: AudioClipType;
  /** Fade/crossfade curve used by the clip's audio fades. */
  audioTransition?: AudioTransitionType;
  colorGrade?: EnhancedColorGrade;
  appliedEffects?: AppliedEffect[];
  textProperties?: TextProperties;
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio';
  name: string; // e.g. "V3", "V2", "V1", "A1", "A2", "A3"
  visible: boolean; // video output toggle (eye icon)
  muted: boolean; // audio mute toggle (M)
  solo: boolean; // audio solo toggle (S)
  locked: boolean; // padlock icon
  volume: number; // track volume multiplier (0.0 to 2.0)
  pan?: number;   // -1.0 to 1.0 (left to right)
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // in seconds
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  assets: MediaAsset[];
  playhead: number;
  inPoint: number | null;
  outPoint: number | null;
  createdAt: string;
  updatedAt: string;
  /** Saved by "Convert to Short" so the vertical conversion can be removed again. */
  shortFormat?: ShortFormatBackup;
}

export interface ShortFormatBackup {
  width: number;
  height: number;
  appliedAt: string;
  /** Original transform per clip id, captured before the 9:16 conversion. */
  transforms: Record<string, { x: number; y: number; scale: number; rotation: number }>;
}

export interface ExportPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  format: ExportFormat;
  codec: string;
}

export interface RenderJob {
  id: string;
  projectName: string;
  outputFileName: string;
  outputPath: string;
  downloadUrl: string;
  status: 'idle' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentTime: number;
  totalDuration: number;
  error?: string | null;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
  duration?: number;
  type?: 'chapter' | 'cue' | 'comment';
  selected?: boolean;
}

export interface ViewSettings {
  zoomFit: boolean;
  safeMargins: boolean;
  rulers: boolean;
  guides: boolean;
  fullscreen: boolean;
  playbackRes: 'Full' | '1/2' | '1/4';
  snapToGrid: boolean;
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  panelVisibility: Record<string, boolean>;
  activeWorkspace: WorkspaceTab;
}

export interface PanelVisibility {
  source: boolean;
  program: boolean;
  effectControls: boolean;
  projectBin: boolean;
  audioMixer: boolean;
  lumetriColor: boolean;
  effectsLibrary: boolean;
  essentialGraphics: boolean;
}

// --- Color Enhancement Types ---

export type CurveChannel = 'master' | 'red' | 'green' | 'blue';

export interface CurvePoint {
  x: number; // 0 to 1
  y: number; // 0 to 1
  interpolation?: 'linear' | 'bezier';
}

export interface RGBACurves {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface HSLSecondary {
  enabled: boolean;
  hue: number;        // 0 to 360
  hueRange: number;   // 0 to 100 (softness)
  saturation: number; // 0 to 100
  satRange: number;   // 0 to 100
  luminance: number;  // 0 to 100
  lumRange: number;   // 0 to 100
  // Correction applied to selected range
  temp: number;       // -100 to 100
  tint: number;       // -100 to 100
  exposure: number;   // -100 to 100
  contrast: number;   // -100 to 100
  saturationAdj: number; // -100 to 100
}

export interface ColorWheel {
  angle: number;   // 0 to 360
  magnitude: number; // 0 to 100
}

export interface ColorWheels {
  shadows: ColorWheel;
  midtones: ColorWheel;
  highlights: ColorWheel;
  // Global offset
  global: ColorWheel;
}

export interface EnhancedColorGrade extends ColorGrade {
  curves?: RGBACurves;
  hslSecondary?: HSLSecondary;
  wheels?: ColorWheels;
  hueVsSat?: CurvePoint[];   // Hue vs Saturation curve
  hueVsHue?: CurvePoint[];   // Hue vs Hue curve
}

export interface BeforeAfterState {
  enabled: boolean;
  splitPosition: number; // 0 to 1 (vertical split)
  referenceClipId: string | null;
}

export interface LUTPreset {
  id: string;
  name: string;
  description: string;
  category: 'cinematic' | 'vintage' | 'modern' | 'monochrome' | 'creative';
  // Approximated as CSS filter chain
  filterChain: string;
}

export interface ColorMatchSource {
  clipId: string;
  matchType: 'skinTone' | 'histogram' | 'manual';
}

// --- Audio Playback Types ---

export interface AudioBufferCache {
  [assetId: string]: AudioBuffer | null;
}

export interface AudioClipInstance {
  clipId: string;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  panNode: StereoPannerNode | null;
  startTime: number; // audio context time when started
  stopTime: number; // audio context time when to stop
  offsetInClip: number; // timeline offset inside the clip when playback started
  isPlaying: boolean;
}

export interface AudioTrackNode {
  trackId: string;
  gainNode: GainNode;
  panNode: StereoPannerNode;
  analyser: AnalyserNode;
}

export interface AudioBus {
  id: string;
  name: string;
  trackIds: string[];
  gainNode: GainNode | null;
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface LoudnessMeasurement {
  integratedLUFS: number;
  truePeak: number;
  lra: number;
  momentaryLUFS: number;
  shortTermLUFS: number;
  updatedAt: number;
}

export interface AudioPlaybackState {
  isInitialized: boolean;
  isPlaying: boolean;
  playheadTime: number;
  activeInstances: AudioClipInstance[];
  trackNodes: AudioTrackNode[];
  busNodes: AudioBus[];
  bufferCache: AudioBufferCache;
  masterGain: GainNode | null;
  analyserLeft: AnalyserNode | null;
  analyserRight: AnalyserNode | null;
  lastUpdate: number;
}

// --- Export Types ---

export type ExportFormat = 'mp4' | 'mov' | 'webm' | 'avi';

export interface ExportLocation {
  id: string;
  path: string;
  label: string;
  availableSpace?: number;
  lastUsed?: number;
}

export interface ExportMetadata {
  title?: string;
  description?: string;
  copyright?: string;
  author?: string;
  creationDate?: string;
}

export interface ExportPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  format: ExportFormat;
  codec: string;
}

export interface ExportJob {
  id: string;
  presetId: string;
  presetName: string;
  format: ExportFormat;
  location: ExportLocation | null;
  outputFileName: string;
  outputPath: string;
  downloadUrl: string;
  metadata: ExportMetadata;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
  progress: number;
  currentTime: number;
  totalDuration: number;
  queuePosition: number;
  error?: string | null;
  createdAt: number;
  completedAt?: number;
}

export interface ExportHistoryItem {
  id: string;
  projectName: string;
  outputFileName: string;
  outputPath: string;
  format: ExportFormat;
  duration: number;
  fileSize?: number;
  completedAt: number;
  downloadUrl: string;
}

// --- Graphics / Motion Graphics Types ---

export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 'line' | 'arrow';

export type PinPosition =
  | 'none'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

export type TextAnimationType =
  | 'none'
  | 'fade-in'
  | 'fade-out'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'typewriter'
  | 'bounce'
  | 'glitch'
  | 'scale-up'
  | 'blur-in'
  | 'kinetic';

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface ShapeLayer {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string | null;
  strokeWidth: number;
  cornerRadius: number;
  rotation: number;
  opacity: number;
  pin: PinPosition;
  pinOffset: { x: number; y: number };
}

export interface TextAnimation {
  id: string;
  type: TextAnimationType;
  duration: number; // seconds
  easing: EasingType;
  delay: number; // seconds
  enabled: boolean;
}

export interface EssentialProperty {
  id: string;
  name: string;
  propertyPath: string; // e.g. 'textProperties.text', 'colorGrade.temperature'
  value: any;
  exposedToInstance: boolean;
}

export interface MotionGraphicsTemplate {
  id: string;
  name: string;
  category: 'lower-third' | 'end-screen' | 'social' | 'news' | 'sports' | 'wedding' | 'corporate' | 'instagram';
  description: string;
  thumbnailColor: string;
  defaultText: string;
  defaultFontFamily: string;
  defaultFontSize: number;
  defaultColor: string;
  defaultBackgroundColor: string | null;
  defaultShapes: ShapeLayer[];
  defaultAnimation: TextAnimation;
  essentialProperties: EssentialProperty[];
}

export interface GraphicsState {
  shapeLayers: ShapeLayer[];
  textAnimations: TextAnimation[];
  essentialProperties: EssentialProperty[];
  selectedShapeId: string | null;
}

// --- Phase 7: Professional Features Types ---

// Adjustment Layer
export interface AdjustmentLayer {
  id: string;
  clipId: string; // references the timeline clip that is an adjustment layer
  affectsTracks: string[]; // track IDs below this layer that are affected
  opacity: number;
}

// Nested Sequence
export interface NestedSequence {
  id: string;
  name: string;
  projectId: string; // references another project file
  width: number;
  height: number;
  fps: number;
  duration: number;
  createdAt: string;
}

// Time Remapping (speed keyframes)
export interface SpeedKeyframe {
  id: string;
  time: number; // seconds in clip
  speed: number; // multiplier (1.0 = 100%)
  interpolation: 'linear' | 'bezier' | 'step';
}

export interface TimeRemapping {
  clipId: string;
  enabled: boolean;
  speedKeyframes: SpeedKeyframe[];
  reverse: boolean;
}

// Auto-Save
export interface AutoSaveVersion {
  id: string;
  projectId: string;
  name: string;
  timestamp: number;
  fileSize: number;
  clipCount: number;
}

export interface AutoSaveSettings {
  enabled: boolean;
  intervalMinutes: number; // 5, 10, 20, 30
  maxVersions: number; // 5, 10, 20
  lastAutoSave: number;
}

// Project Manager
export interface MediaLinkStatus {
  assetId: string;
  assetName: string;
  expectedPath: string;
  found: boolean;
  actualPath: string | null;
}

export interface ProjectManagerReport {
  missingAssets: MediaLinkStatus[];
  totalAssets: number;
  missingCount: number;
  totalSize: number;
  collectedSize: number;
}

// Proxy Workflow
export interface ProxySettings {
  enabled: boolean;
  proxyResolution: '720p' | '540p' | '360p';
  proxyCodec: 'h264' | 'prores';
  generateOnImport: boolean;
}

export interface ProxyInfo {
  assetId: string;
  proxyPath: string | null;
  proxyUrl: string | null;
  generated: boolean;
}

// Multicamera
export interface MulticamAngle {
  id: string;
  name: string;
  clipIds: string[]; // clip IDs that make up this angle
  color: string;
  syncMethod: 'timecode' | 'audio' | 'manual';
  syncOffset: number; // seconds
}

export interface MulticamSequence {
  id: string;
  name: string;
  angles: MulticamAngle[];
  activeAngleId: string | null;
  syncPoint: number; // seconds - the common sync point
  isMulticam: boolean;
}
