import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { Project, TimelineClip, TimelineTrack, MediaAsset, ActiveTool, WorkspaceTab, Marker, ViewSettings, PanelVisibility, EnhancedColorGrade, RGBACurves, HSLSecondary, ColorWheels, ColorWheel, CurveChannel, CurvePoint, ExportFormat, BeforeAfterState, LUTPreset, AudioBufferCache, AudioClipInstance, AudioTrackNode, AudioBus, LoudnessMeasurement, ShapeLayer, TextAnimation, EssentialProperty, MotionGraphicsTemplate, ExportLocation, ExportMetadata, ExportJob, ExportHistoryItem, AdjustmentLayer, NestedSequence, TimeRemapping, SpeedKeyframe, AutoSaveVersion, AutoSaveSettings, ProxySettings, ProxyInfo, MulticamSequence } from '../types/editor';
import { globalAudioEngine } from '../utils/audioEngine';
import { getClipGainAt } from '../utils/audioEnvelope';
import { planMagicEdit, type MagicEditPlan } from '../utils/magicEdit';
import { DEFAULT_GRADE } from '../utils/colorProcessing';

// Premiere Pro standard label colors
export const PREMIERE_LABEL_COLORS = [
  '#729ACC', // Iris (Video default)
  '#29D698', // Caribbean (Audio default)
  '#E384E3', // Lavender
  '#51B858', // Forest
  '#F76FA4', // Rose
  '#EDA63B', // Mango
  '#2FBFDE', // Cerulean
  '#A690E0', // Violet
];

// Default RGB curves (linear)
const DEFAULT_CURVES: RGBACurves = {
  master: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
    { x: 1, y: 1 },
  ],
  red: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
    { x: 1, y: 1 },
  ],
  green: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
    { x: 1, y: 1 },
  ],
  blue: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.75 },
    { x: 1, y: 1 },
  ],
};

const DEFAULT_WHEELS: ColorWheels = {
  shadows: { angle: 0, magnitude: 0 },
  midtones: { angle: 0, magnitude: 0 },
  highlights: { angle: 0, magnitude: 0 },
  global: { angle: 0, magnitude: 0 },
};

const DEFAULT_HSL_SECONDARY: HSLSecondary = {
  enabled: false,
  hue: 0,
  hueRange: 50,
  saturation: 0,
  satRange: 50,
  luminance: 0,
  lumRange: 50,
  temp: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  saturationAdj: 0,
};

// Returns a fully-populated EnhancedColorGrade, filling in defaults for any
// missing sub-objects (curves / wheels / hslSecondary). Used everywhere we
// mutate a clip's grade so the update helper receives a complete object.
type CompleteColorGrade = EnhancedColorGrade & {
  curves: RGBACurves;
  wheels: ColorWheels;
  hslSecondary: HSLSecondary;
};

function gradeWithDefaults(grade?: EnhancedColorGrade): CompleteColorGrade {
  const base: EnhancedColorGrade = grade ?? {
    temperature: 0, tint: 0, exposure: 0, contrast: 0,
    highlights: 0, shadows: 0, whites: 0, blacks: 0,
    saturation: 100, vignette: 0, lut: 'None',
  };
  return {
    ...base,
    curves: { ...DEFAULT_CURVES, ...base.curves },
    wheels: { ...DEFAULT_WHEELS, ...base.wheels },
    hslSecondary: { ...DEFAULT_HSL_SECONDARY, ...base.hslSecondary },
  } as CompleteColorGrade;
}

// LUT presets with CSS filter approximations
export const LUT_PRESETS: LUTPreset[] = [
  {
    id: 'lut_none',
    name: 'None',
    description: 'No LUT applied',
    category: 'creative',
    filterChain: '',
  },
  {
    id: 'lut_teal_orange',
    name: 'Cinematic Teal & Orange',
    description: 'Classic Hollywood look with teal shadows and orange highlights',
    category: 'cinematic',
    filterChain: 'contrast(1.2) saturate(1.3) hue-rotate(-10deg)',
  },
  {
    id: 'lut_kodak',
    name: 'Warm Kodak 2383',
    description: 'Warm film stock emulation',
    category: 'cinematic',
    filterChain: 'sepia(0.25) contrast(1.1) brightness(1.05) saturate(1.2)',
  },
  {
    id: 'lut_noir',
    name: 'Film Noir Monochrome',
    description: 'High contrast black and white',
    category: 'monochrome',
    filterChain: 'grayscale(1) contrast(1.2)',
  },
  {
    id: 'lut_vintage',
    name: 'Vintage Film',
    description: 'Aged film with faded look',
    category: 'vintage',
    filterChain: 'sepia(0.6) contrast(1.1)',
  },
  {
    id: 'lut_cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'High contrast neon with teal/magenta split',
    category: 'creative',
    filterChain: 'contrast(1.3) saturate(2) hue-rotate(200deg)',
  },
  {
    id: 'lut_bleach_bypass',
    name: 'Bleach Bypass',
    description: 'Desaturated high-contrast look',
    category: 'modern',
    filterChain: 'saturate(0.3) contrast(1.3) brightness(1.1)',
  },
  {
    id: 'lut_cross_process',
    name: 'Cross Process',
    description: 'Shifted colors with cyan/yellow cast',
    category: 'creative',
    filterChain: 'contrast(1.1) saturate(1.2) hue-rotate(15deg)',
  },
  {
    id: 'lut_golden_hour',
    name: 'Golden Hour',
    description: 'Warm sunset glow',
    category: 'vintage',
    filterChain: 'sepia(0.15) brightness(1.1) saturate(1.2) hue-rotate(-15deg)',
  },
  {
    id: 'lut_midnight',
    name: 'Midnight',
    description: 'Deep cool blues for night scenes',
    category: 'modern',
    filterChain: 'contrast(1.1) saturate(0.8) hue-rotate(30deg) brightness(0.9)',
  },
  {
    id: 'lut_forest',
    name: 'Forest',
    description: 'Enhanced greens with natural contrast',
    category: 'modern',
    filterChain: 'saturate(1.3) contrast(1.1) hue-rotate(-20deg)',
  },
  {
    id: 'lut_desert',
    name: 'Desert',
    description: 'Warm sandy tones',
    category: 'vintage',
    filterChain: 'sepia(0.4) contrast(1.1) brightness(1.05)',
  },
  {
    id: 'lut_kodachrome',
    name: 'Kodachrome',
    description: 'Rich vibrant colors with slight contrast',
    category: 'cinematic',
    filterChain: 'contrast(1.15) saturate(1.25) brightness(1.02)',
  },
  {
    id: 'lut_polaroid',
    name: 'Polaroid',
    description: 'Faded instant film look',
    category: 'vintage',
    filterChain: 'saturate(0.8) contrast(0.9) brightness(1.05)',
  },
  {
    id: 'lut_instagram',
    name: 'Instagram',
    description: 'Modern social media filter',
    category: 'creative',
    filterChain: 'contrast(1.1) saturate(1.15) brightness(1.02)',
  },
];

const INITIAL_TRACKS: TimelineTrack[] = [
  { id: 'v3', type: 'video', name: 'V3', visible: true, muted: false, solo: false, locked: false, volume: 1.0 },
  { id: 'v2', type: 'video', name: 'V2', visible: true, muted: false, solo: false, locked: false, volume: 1.0 },
  { id: 'v1', type: 'video', name: 'V1', visible: true, muted: false, solo: false, locked: false, volume: 1.0 },
  { id: 'a1', type: 'audio', name: 'A1', visible: true, muted: false, solo: false, locked: false, volume: 1.0 },
  { id: 'a2', type: 'audio', name: 'A2', visible: true, muted: false, solo: false, locked: false, volume: 1.0 },
  { id: 'a3', type: 'audio', name: 'A3', visible: true, muted: false, solo: false, locked: false, volume: 1.0 },
];

const DEFAULT_PROJECT: Project = {
  id: `proj_${Date.now()}`,
  name: 'Untitled Sequence 01',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 20, // default 20s canvas duration
  tracks: INITIAL_TRACKS,
  clips: [],
  assets: [],
  playhead: 0,
  inPoint: null,
  outPoint: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface EditorContextType {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  activeWorkspace: WorkspaceTab;
  setActiveWorkspace: (tab: WorkspaceTab) => void;
  zoom: number; // pixels per second
  setZoom: (z: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  playhead: number;
  seek: (t: number) => void;
  selectedClipId: string | null;
  selectedClipIds: string[];
  setSelectedClipIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedClipId: (id: string | null) => void;
  sourceAsset: MediaAsset | null;
  setSourceAsset: (asset: MediaAsset | null) => void;
  sourceInPoint: number;
  setSourceInPoint: (t: number) => void;
  sourceOutPoint: number;
  setSourceOutPoint: (t: number) => void;
  snappingEnabled: boolean;
  setSnappingEnabled: (s: boolean | ((prev: boolean) => boolean)) => void;
  isExportModalOpen: boolean;
  setIsExportModalOpen: (o: boolean) => void;
  isNewProjectModalOpen: boolean;
  setIsNewProjectModalOpen: (o: boolean) => void;
  isOpenProjectModalOpen: boolean;
  setIsOpenProjectModalOpen: (o: boolean) => void;
  hasUnsavedChanges: boolean;
  
  // Actions
  togglePlay: () => void;
  stepFrames: (frames: number) => void;
  addClipToTimeline: (asset: MediaAsset, trackId: string, startTime: number, customDuration?: number) => void;
  moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => void;
  trimClip: (clipId: string, edge: 'start' | 'end', deltaSeconds: number) => void;
  splitClipAt: (clipId: string, splitTime: number) => void;
  splitAtPlayhead: () => void;
  deleteClip: (clipId: string, ripple?: boolean) => void;
  updateClipProperties: (clipId: string, updates: Partial<TimelineClip>) => void;
  removeMagicLook: (clipId?: string) => number;
  hasMagicLook: (clipId?: string) => boolean;
  toggleTrackOutput: (trackId: string) => void;
  addTrack: (type: 'video' | 'audio') => void;
  removeTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  updateClipColorGrade: (clipId: string, updates: Partial<import('../types/editor').ColorGrade>) => void;
  updateClipCurves: (clipId: string, channel: import('../types/editor').CurveChannel, points: import('../types/editor').CurvePoint[]) => void;
  updateClipHSLSecondary: (clipId: string, updates: Partial<import('../types/editor').HSLSecondary>) => void;
  updateClipColorWheels: (clipId: string, wheel: 'shadows' | 'midtones' | 'highlights' | 'global', updates: Partial<import('../types/editor').ColorWheel>) => void;
  updateHueVsSat: (clipId: string, points: import('../types/editor').CurvePoint[]) => void;
  updateHueVsHue: (clipId: string, points: import('../types/editor').CurvePoint[]) => void;
  toggleBeforeAfter: () => void;
  setBeforeAfterSplit: (position: number) => void;
  setReferenceClip: (clipId: string | null) => void;
  matchColorFromClip: (sourceClipId: string, targetClipId: string) => void;
  addClipEffect: (clipId: string, effect: Omit<import('../types/editor').AppliedEffect, 'id'>) => void;
  toggleClipEffect: (clipId: string, effectId: string) => void;
  removeClipEffect: (clipId: string, effectId: string) => void;
  updateClipEffectValue: (clipId: string, effectId: string, value: number) => void;
  updateClipEffectParam: (clipId: string, effectId: string, key: string, value: number | string | boolean) => void;
  updateClipEffectKeyframes: (clipId: string, effectId: string, keyframes: import('../types/editor').EffectKeyframe[]) => void;
  addTextTitleClip: (textProps: import('../types/editor').TextProperties, duration?: number) => void;
  refreshMediaAssets: () => Promise<void>;
  uploadFiles: (files: FileList | File[]) => Promise<void>;
  saveProject: () => Promise<boolean>;
  loadProjectData: (proj: Project) => void;
  createNewProject: (name: string, width?: number, height?: number, fps?: number) => void;

  // Markers
  markers: Marker[];
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  addMarker: (time: number, label?: string, color?: string) => void;
  deleteMarker: (markerId: string) => void;
  editMarker: (markerId: string, updates: Partial<Marker>) => void;
  goToNextMarker: () => void;
  goToPreviousMarker: () => void;
  clearMarkers: () => void;

  // View settings / panels / fullscreen
  viewSettings: ViewSettings;
  updateViewSetting: (key: keyof ViewSettings, value: any) => void;
  panelVisibility: PanelVisibility;
  togglePanel: (panel: keyof PanelVisibility) => void;
  setPanels: (visibility: Partial<PanelVisibility>) => void;
  fullscreen: boolean;
  setFullscreen: (f: boolean) => void;
  toggleFullscreen: () => void;

  // Color before/after comparison
  beforeAfterState: BeforeAfterState;
  setBeforeAfterState: React.Dispatch<React.SetStateAction<BeforeAfterState>>;

  // Audio engine state & controls
  bufferCache: AudioBufferCache;
  activeInstances: AudioClipInstance[];
  trackNodes: AudioTrackNode[];
  busNodes: AudioBus[];
  audioInitialized: boolean;
  loudness: LoudnessMeasurement;
  initAudio: () => Promise<void>;
  decodeAudioBuffer: (asset: MediaAsset) => Promise<AudioBuffer | null>;
  decodeAllAudioBuffers: () => Promise<void>;
  scheduleClipInstances: (playheadTime: number) => void;
  startPlayback: () => void;
  stopPlayback: () => void;
  startPlaybackLoop: () => void;
  updateLoudness: () => void;
  setBusVolume: (busId: string, volume: number) => void;

  // Motion graphics state
  shapeLayers: ShapeLayer[];
  setShapeLayers: React.Dispatch<React.SetStateAction<ShapeLayer[]>>;
  textAnimations: TextAnimation[];
  setTextAnimations: React.Dispatch<React.SetStateAction<TextAnimation[]>>;
  essentialProperties: EssentialProperty[];
  setEssentialProperties: React.Dispatch<React.SetStateAction<EssentialProperty[]>>;
  selectedShapeId: string | null;
  setSelectedShapeId: (id: string | null) => void;
  graphicsTemplates: MotionGraphicsTemplate[];
  setGraphicsTemplates: React.Dispatch<React.SetStateAction<MotionGraphicsTemplate[]>>;
  addShapeLayer: (shape: Omit<ShapeLayer, 'id'>) => void;
  updateShapeLayer: (shapeId: string, updates: Partial<ShapeLayer>) => void;
  deleteShapeLayer: (shapeId: string) => void;
  addTextAnimation: (animation: Omit<TextAnimation, 'id'>) => void;
  updateTextAnimation: (animId: string, updates: Partial<TextAnimation>) => void;
  addEssentialProperty: (prop: Omit<EssentialProperty, 'id'>) => void;
  updateEssentialProperty: (propId: string, value: any) => void;
  clearClipText: (clipId: string) => void;
  loadGraphicsTemplates: () => void;

  // Export state
  exportQueue: ExportJob[];
  setExportQueue: React.Dispatch<React.SetStateAction<ExportJob[]>>;
  exportHistory: ExportHistoryItem[];
  setExportHistory: React.Dispatch<React.SetStateAction<ExportHistoryItem[]>>;
  exportLocation: ExportLocation | null;
  setExportLocation: (loc: ExportLocation | null) => void;
  exportMetadata: ExportMetadata;
  setExportMetadata: React.Dispatch<React.SetStateAction<ExportMetadata>>;
  exportFormat: ExportFormat;
  setExportFormat: (f: ExportFormat) => void;
  addExportJob: (job: Omit<ExportJob, 'id' | 'queuePosition' | 'createdAt'>) => void;
  updateExportJob: (jobId: string, updates: Partial<ExportJob>) => void;
  removeExportJob: (jobId: string) => void;
  addToExportHistory: (item: Omit<ExportHistoryItem, 'id'>) => void;
  clearExportQueue: () => void;

  // Phase 7 professional features state
  adjustmentLayers: import('../types/editor').AdjustmentLayer[];
  setAdjustmentLayers: React.Dispatch<React.SetStateAction<import('../types/editor').AdjustmentLayer[]>>;
  nestedSequences: NestedSequence[];
  setNestedSequences: React.Dispatch<React.SetStateAction<NestedSequence[]>>;
  timeRemappings: TimeRemapping[];
  setTimeRemappings: React.Dispatch<React.SetStateAction<TimeRemapping[]>>;
  autoSaveSettings: AutoSaveSettings;
  setAutoSaveSettings: React.Dispatch<React.SetStateAction<AutoSaveSettings>>;
  autoSaveVersions: AutoSaveVersion[];
  setAutoSaveVersions: React.Dispatch<React.SetStateAction<AutoSaveVersion[]>>;
  proxySettings: ProxySettings;
  setProxySettings: React.Dispatch<React.SetStateAction<ProxySettings>>;
  proxyInfo: ProxyInfo[];
  setProxyInfo: React.Dispatch<React.SetStateAction<ProxyInfo[]>>;
  multicamSequences: MulticamSequence[];
  setMulticamSequences: React.Dispatch<React.SetStateAction<MulticamSequence[]>>;
  activeMulticamId: string | null;
  setActiveMulticamId: (id: string | null) => void;
  addAdjustmentLayer: (clipId: string, affectsTracks?: string[], opacity?: number) => void;
  updateAdjustmentLayer: (layerId: string, updates: Partial<AdjustmentLayer>) => void;
  removeAdjustmentLayer: (layerId: string) => void;
  addNestedSequence: (seq: Omit<NestedSequence, 'id' | 'createdAt'>) => string;
  updateNestedSequence: (seqId: string, updates: Partial<NestedSequence>) => void;
  removeNestedSequence: (seqId: string) => void;
  addTimeRemapping: (clipId: string, keyframes?: SpeedKeyframe[], reverse?: boolean) => void;
  updateTimeRemapping: (clipId: string, updates: Partial<TimeRemapping>) => void;
  removeTimeRemapping: (clipId: string) => void;
  addSpeedKeyframe: (clipId: string, keyframe: Omit<SpeedKeyframe, 'id'>) => void;
  updateAutoSaveSettings: (settings: Partial<AutoSaveSettings>) => void;
  addAutoSaveVersion: (version: Omit<AutoSaveVersion, 'id'>) => void;
  removeAutoSaveVersion: (versionId: string) => void;
  restoreAutoSaveVersion: (versionId: string) => void;
  updateProxySettings: (settings: Partial<ProxySettings>) => void;
  addProxyInfo: (info: ProxyInfo) => void;
  updateProxyInfo: (assetId: string, updates: Partial<ProxyInfo>) => void;
  addMulticamSequence: (seq: Omit<MulticamSequence, 'id'>) => string;
  updateMulticamSequence: (seqId: string, updates: Partial<MulticamSequence>) => void;
  setMulticamActiveAngle: (seqId: string, angleId: string | null) => void;
  removeMulticamSequence: (seqId: string) => void;
  collectProjectFiles: (targetDir: string) => { copied: number; missed: unknown[] };
  relinkMedia: (assetId: string, newPath: string) => void;

  // Undo / Redo history
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Smart Tools (AI-style)
  applyMagicEdit: (prompt: string, clipId?: string) => import('../utils/magicEdit').MagicEditPlan;
  convertToShort: () => void;
  removeShortFormat: () => void;
  isShortFormat: boolean;
  addCaptions: (
    lines: string[],
    startAt: number,
    perLineDuration: number,
    position?: { x: number; y: number }
  ) => void;
}

const EditorContext = createContext<EditorContextType | null>(null);

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<Project>(DEFAULT_PROJECT);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>('editing');
  const [zoom, setZoom] = useState<number>(60); // 60 pixels per second
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playhead, setPlayhead] = useState<number>(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [sourceAsset, setSourceAsset] = useState<MediaAsset | null>(null);
  const [sourceInPoint, setSourceInPoint] = useState<number>(0);
  const [sourceOutPoint, setSourceOutPoint] = useState<number>(5);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState<boolean>(false);
  const [isOpenProjectModalOpen, setIsOpenProjectModalOpen] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [viewSettings, setViewSettings] = useState<ViewSettings>({
    zoomFit: false,
    safeMargins: false,
    rulers: true,
    guides: false,
    fullscreen: false,
    playbackRes: 'Full',
    snapToGrid: true,
  });
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>({
    source: true,
    program: true,
    effectControls: true,
    projectBin: true,
    audioMixer: true,
    lumetriColor: true,
    effectsLibrary: true,
    essentialGraphics: true,
  });
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [beforeAfterState, setBeforeAfterState] = useState<BeforeAfterState>({
    enabled: false,
    splitPosition: 0.5,
    referenceClipId: null,
  });

  // --- Web Audio API Playback State ---
  const [bufferCache, setBufferCache] = useState<AudioBufferCache>({});
  const [activeInstances, setActiveInstances] = useState<AudioClipInstance[]>([]);
  const [trackNodes, setTrackNodes] = useState<AudioTrackNode[]>([]);
  const [busNodes, setBusNodes] = useState<AudioBus[]>([]);
  const [audioInitialized, setAudioInitialized] = useState<boolean>(false);
  const [loudness, setLoudness] = useState<LoudnessMeasurement>({
    integratedLUFS: -60,
    truePeak: -60,
    lra: 0,
    momentaryLUFS: -60,
    shortTermLUFS: -60,
    updatedAt: 0,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);
  const playbackLoopRef = useRef<number | null>(null);
  const instancesRef = useRef<AudioClipInstance[]>([]);
  instancesRef.current = activeInstances;

  // --- Export Queue / History State ---
  const [exportQueue, setExportQueue] = useState<ExportJob[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([]);
  const [exportLocation, setExportLocation] = useState<ExportLocation | null>(null);
  const [exportMetadata, setExportMetadata] = useState<ExportMetadata>({});
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');

  // --- Graphics / Motion Graphics State ---
  const [shapeLayers, setShapeLayers] = useState<ShapeLayer[]>([]);
  const [textAnimations, setTextAnimations] = useState<TextAnimation[]>([]);
  const [essentialProperties, setEssentialProperties] = useState<EssentialProperty[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [graphicsTemplates, setGraphicsTemplates] = useState<MotionGraphicsTemplate[]>([]);

  // --- Phase 7: Professional Features State ---
  const [adjustmentLayers, setAdjustmentLayers] = useState<AdjustmentLayer[]>([]);
  const [nestedSequences, setNestedSequences] = useState<NestedSequence[]>([]);
  const [timeRemappings, setTimeRemappings] = useState<TimeRemapping[]>([]);
  const [autoSaveSettings, setAutoSaveSettings] = useState<AutoSaveSettings>({
    enabled: true,
    intervalMinutes: 10,
    maxVersions: 10,
    lastAutoSave: 0,
  });
  const [autoSaveVersions, setAutoSaveVersions] = useState<AutoSaveVersion[]>([]);
  const [proxySettings, setProxySettings] = useState<ProxySettings>({
    enabled: false,
    proxyResolution: '720p',
    proxyCodec: 'h264',
    generateOnImport: false,
  });
  const [proxyInfo, setProxyInfo] = useState<ProxyInfo[]>([]);
  const [multicamSequences, setMulticamSequences] = useState<MulticamSequence[]>([]);
  const [activeMulticamId, setActiveMulticamId] = useState<string | null>(null);

  // --- Undo / Redo history snapshots ---
  const undoStackRef = useRef<Project[]>([]);
  const redoStackRef = useRef<Project[]>([]);
  const lastHistoryProjectRef = useRef<Project>(DEFAULT_PROJECT);
  const isHistoryRestoringRef = useRef<boolean>(false);
  const [historyCounts, setHistoryCounts] = useState<{ undo: number; redo: number }>({ undo: 0, redo: 0 });

  // Sync exposed counters after every stack change
  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, []);

  // Push every non-restore project mutation onto the undo stack.
  useEffect(() => {
    if (isHistoryRestoringRef.current) {
      isHistoryRestoringRef.current = false;
      lastHistoryProjectRef.current = project;
      return;
    }
    if (project === lastHistoryProjectRef.current) return;
    undoStackRef.current.push(lastHistoryProjectRef.current);
    if (undoStackRef.current.length > 80) undoStackRef.current.shift();
    redoStackRef.current = [];
    lastHistoryProjectRef.current = project;
    syncHistoryCounts();
  }, [syncHistoryCounts]);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prevProject = stack.pop() as Project;
    isHistoryRestoringRef.current = true;
    redoStackRef.current.push(lastHistoryProjectRef.current);
    lastHistoryProjectRef.current = prevProject;
    setProject(prevProject);
    syncHistoryCounts();
    setHasUnsavedChanges(true);
  }, [syncHistoryCounts]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const nextProject = stack.pop() as Project;
    isHistoryRestoringRef.current = true;
    undoStackRef.current.push(lastHistoryProjectRef.current);
    lastHistoryProjectRef.current = nextProject;
    setProject(nextProject);
    syncHistoryCounts();
    setHasUnsavedChanges(true);
  }, [syncHistoryCounts]);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  // Keep live audio automation in sync even while the playback loop closure
  // was created before the latest project edit.
  const projectClipsRef = useRef(project.clips);
  projectClipsRef.current = project.clips;

  // Initialize and load assets from server
  const refreshMediaAssets = useCallback(async () => {
    try {
      const res = await fetch('/api/media');
      if (res.ok) {
        const assets: MediaAsset[] = await res.json();
        setProject(prev => {
          // If first time and project clips empty, populate a default timeline demo
          if (prev.clips.length === 0 && assets.length >= 2) {
            const vAsset1 = assets.find(a => a.type === 'video');
            const vAsset2 = assets.filter(a => a.type === 'video')[1] || assets.find(a => a.type === 'image');
            const aAsset = assets.find(a => a.type === 'audio');

            const demoClips: TimelineClip[] = [];
            if (vAsset1) {
              demoClips.push({
                id: `clip_${Date.now()}_1`,
                assetId: vAsset1.id,
                trackId: 'v1',
                name: vAsset1.name,
                type: vAsset1.type,
                color: '#729ACC',
                startTime: 0,
                duration: Math.min(6, vAsset1.duration),
                inPoint: 0,
                outPoint: Math.min(6, vAsset1.duration),
                speed: 1.0,
                volume: 1.0,
                muted: false,
                opacity: 1.0,
                transform: { x: 0, y: 0, scale: 1.0, rotation: 0 }
              });
            }
            if (vAsset2) {
              demoClips.push({
                id: `clip_${Date.now()}_2`,
                assetId: vAsset2.id,
                trackId: 'v1',
                name: vAsset2.name,
                type: vAsset2.type,
                color: '#729ACC',
                startTime: 6,
                duration: Math.min(5, vAsset2.duration),
                inPoint: 0,
                outPoint: Math.min(5, vAsset2.duration),
                speed: 1.0,
                volume: 1.0,
                muted: false,
                opacity: 1.0,
                transform: { x: 0, y: 0, scale: 1.0, rotation: 0 }
              });
            }
            if (aAsset) {
              demoClips.push({
                id: `clip_${Date.now()}_3`,
                assetId: aAsset.id,
                trackId: 'a1',
                name: aAsset.name,
                type: 'audio',
                color: '#29D698',
                startTime: 0,
                duration: 11,
                inPoint: 0,
                outPoint: 11,
                speed: 1.0,
                volume: 0.8,
                muted: false,
                opacity: 1.0,
                transform: { x: 0, y: 0, scale: 1.0, rotation: 0 }
              });
            }

            return {
              ...prev,
              assets,
              clips: demoClips,
              duration: 15
            };
          }
          return { ...prev, assets };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch media assets from server:', e);
    }
  }, []);

  useEffect(() => {
    refreshMediaAssets();
    // Try restoring autosaved project from localStorage if available
    try {
      const saved = localStorage.getItem('pr_autosave_project');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.clips) {
          setProject(parsed);
        }
      }
    } catch (e) {}
  }, [refreshMediaAssets]);

  // Autosave to localStorage + server with timer interval
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoSaveSettings.enabled || project.clips.length === 0) {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return;
    }

    const intervalMs = autoSaveSettings.intervalMinutes * 60 * 1000;
    autosaveTimerRef.current = window.setInterval(() => {
      try {
        localStorage.setItem('pr_autosave_project', JSON.stringify(project));

        // Also save to server
        const versionData = {
          ...project,
          name: project.name,
          clipCount: project.clips.length,
        };
        fetch('/api/projects/autosave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, version: versionData })
        }).catch(e => console.warn('Auto-save to server failed:', e));

        setAutoSaveSettings(prev => ({ ...prev, lastAutoSave: Date.now() }));
      } catch (e) {}
    }, intervalMs);

    return () => {
      if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current);
    };
  }, [autoSaveSettings.enabled, autoSaveSettings.intervalMinutes, project.clips.length, project.id, project.name]);

  // Recalculate duration whenever clips change
  useEffect(() => {
    if (project.clips.length > 0) {
      const maxEndTime = Math.max(...project.clips.map(c => c.startTime + c.duration));
      const targetDuration = Math.max(15, Math.ceil(maxEndTime + 5));
      if (targetDuration !== project.duration) {
        setProject(p => ({ ...p, duration: targetDuration }));
      }
    }
  }, [project.clips]);

  // Real-time playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = null;
      return;
    }

    globalAudioEngine.init();
    globalAudioEngine.resume();

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaSec = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setPlayhead(prev => {
        const next = prev + deltaSec;
        if (next >= project.duration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      if (isPlayingRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, project.duration]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const seek = useCallback((t: number) => {
    setPlayhead(Math.max(0, Math.min(project.duration, t)));
  }, [project.duration]);

  const stepFrames = useCallback((frames: number) => {
    const frameDuration = 1 / project.fps;
    seek(playheadRef.current + frames * frameDuration);
  }, [project.fps, seek]);

  // Timeline Clip Manipulations
  const addClipToTimeline = useCallback((asset: MediaAsset, trackId: string, startTime: number, customDuration?: number) => {
    const isAudio = asset.type === 'audio';
    const clipDur = customDuration || (asset.type === 'image' ? 5.0 : Math.min(10, asset.duration));
    const labelColor = isAudio ? '#29D698' : '#729ACC';

    const newClip: TimelineClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      assetId: asset.id,
      trackId,
      name: asset.name,
      type: asset.type,
      color: labelColor,
      startTime: Math.max(0, startTime),
      duration: clipDur,
      inPoint: 0,
      outPoint: clipDur,
      speed: 1.0,
      volume: 1.0,
      muted: false,
      opacity: 1.0,
      transform: { x: 0, y: 0, scale: 1.0, rotation: 0 }
    };

    setProject(prev => ({
      ...prev,
      clips: [...prev.clips, newClip]
    }));
    setSelectedClipId(newClip.id);
    setHasUnsavedChanges(true);
  }, []);

  const moveClip = useCallback((clipId: string, newStartTime: number, newTrackId?: string) => {
    setProject(prev => {
      const clip = prev.clips.find(c => c.id === clipId);
      if (!clip) return prev;

      let targetTrackId = newTrackId || clip.trackId;
      // Ensure video clips stay on video tracks and audio clips on audio tracks
      if (newTrackId) {
        const targetTrack = prev.tracks.find(t => t.id === newTrackId);
        if (targetTrack) {
          if (clip.type === 'audio' && targetTrack.type !== 'audio') targetTrackId = clip.trackId;
          if ((clip.type === 'video' || clip.type === 'image') && targetTrack.type !== 'video') targetTrackId = clip.trackId;
        }
      }

      return {
        ...prev,
        clips: prev.clips.map(c => {
          if (c.id === clipId) {
            return {
              ...c,
              startTime: Math.max(0, newStartTime),
              trackId: targetTrackId
            };
          }
          return c;
        })
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  const trimClip = useCallback((clipId: string, edge: 'start' | 'end', deltaSeconds: number) => {
    setProject(prev => {
      return {
        ...prev,
        clips: prev.clips.map(c => {
          if (c.id !== clipId) return c;

          if (edge === 'start') {
            const maxDelta = c.duration - 0.2;
            const actualDelta = Math.min(deltaSeconds, maxDelta);
            const newStartTime = Math.max(0, c.startTime + actualDelta);
            const newInPoint = Math.max(0, c.inPoint + actualDelta);
            const newDuration = Math.max(0.2, c.duration - actualDelta);
            return {
              ...c,
              startTime: newStartTime,
              inPoint: newInPoint,
              duration: newDuration
            };
          } else {
            // Trim end
            const newDuration = Math.max(0.2, c.duration + deltaSeconds);
            const newOutPoint = c.inPoint + newDuration;
            return {
              ...c,
              duration: newDuration,
              outPoint: newOutPoint
            };
          }
        })
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  const splitClipAt = useCallback((clipId: string, splitTime: number) => {
    setProject(prev => {
      const clip = prev.clips.find(c => c.id === clipId);
      if (!clip) return prev;
      if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return prev;

      const firstPartDuration = splitTime - clip.startTime;
      const secondPartDuration = clip.duration - firstPartDuration;

      const firstPart: TimelineClip = {
        ...clip,
        duration: firstPartDuration,
        outPoint: clip.inPoint + firstPartDuration
      };

      const secondPart: TimelineClip = {
        ...clip,
        id: `clip_${Date.now()}_split`,
        startTime: splitTime,
        duration: secondPartDuration,
        inPoint: clip.inPoint + firstPartDuration,
        outPoint: clip.outPoint
      };

      return {
        ...prev,
        clips: prev.clips.map(c => (c.id === clipId ? firstPart : c)).concat(secondPart)
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  const splitAtPlayhead = useCallback(() => {
    const curTime = playheadRef.current;
    const clipToSplit = project.clips.find(
      c => curTime > c.startTime && curTime < c.startTime + c.duration
    );
    if (clipToSplit) {
      splitClipAt(clipToSplit.id, curTime);
    }
  }, [project.clips, splitClipAt]);

  const deleteClip = useCallback((clipId: string, ripple: boolean = false) => {
    setProject(prev => {
      const target = prev.clips.find(c => c.id === clipId);
      if (!target) return prev;

      const remainingClips = prev.clips.filter(c => c.id !== clipId);
      if (!ripple) {
        return { ...prev, clips: remainingClips };
      }

      // Ripple delete: shift subsequent clips on the same track to close the gap
      const gapDuration = target.duration;
      const shiftedClips = remainingClips.map(c => {
        if (c.trackId === target.trackId && c.startTime > target.startTime) {
          return {
            ...c,
            startTime: Math.max(target.startTime, c.startTime - gapDuration)
          };
        }
        return c;
      });

      return { ...prev, clips: shiftedClips };
    });

    if (selectedClipId === clipId) setSelectedClipId(null);
    setSelectedClipIds(prev => prev.filter(id => id !== clipId));
    setHasUnsavedChanges(true);
  }, [selectedClipId]);

  const updateClipProperties = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => (c.id === clipId ? { ...c, ...updates } : c))
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Add a new video or audio track. Video tracks stack on top (like Premiere),
  // audio tracks append below. Naming continues the sequence (V4, A4, ...).
  const addTrack = useCallback((type: 'video' | 'audio') => {
    setProject(prev => {
      const nums = prev.tracks
        .filter(t => t.type === type)
        .map(t => parseInt(t.id.replace(/\D/g, ''), 10) || 0);
      const nextNum = Math.max(0, ...nums) + 1;
      const prefix = type === 'video' ? 'v' : 'a';
      const newTrack: TimelineTrack = {
        id: `${prefix}${nextNum}`,
        type,
        name: `${type === 'video' ? 'V' : 'A'}${nextNum}`,
        visible: true,
        muted: false,
        solo: false,
        locked: false,
        volume: 1.0,
        pan: 0,
      };
      const tracks = type === 'video'
        ? [newTrack, ...prev.tracks]
        : [...prev.tracks, newTrack];
      return { ...prev, tracks };
    });
    setHasUnsavedChanges(true);
  }, []);

  // Remove an (empty) track. Refuses to remove tracks that still hold clips,
  // and always keeps at least one video + one audio track.
  const removeTrack = useCallback((trackId: string) => {
    setProject(prev => {
      if (prev.clips.some(c => c.trackId === trackId)) return prev;
      const videos = prev.tracks.filter(t => t.type === 'video').length;
      const audios = prev.tracks.filter(t => t.type === 'audio').length;
      const target = prev.tracks.find(t => t.id === trackId);
      if (!target) return prev;
      if (target.type === 'video' && videos <= 1) return prev;
      if (target.type === 'audio' && audios <= 1) return prev;
      return { ...prev, tracks: prev.tracks.filter(t => t.id !== trackId) };
    });
    setHasUnsavedChanges(true);
  }, []);

  const toggleTrackOutput = useCallback((trackId: string) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, visible: !t.visible } : t))
    }));
  }, []);

  const toggleTrackLock = useCallback((trackId: string) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, locked: !t.locked } : t))
    }));
  }, []);

  const updateClipColorGrade = useCallback((clipId: string, updates: Partial<import('../types/editor').ColorGrade>) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const currentGrade = c.colorGrade || {
            temperature: 0,
            tint: 0,
            exposure: 0,
            contrast: 0,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
            saturation: 100,
            vignette: 0,
            lut: 'None'
          };
          return {
            ...c,
            colorGrade: { ...currentGrade, ...updates }
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  // --- Enhanced Color Actions ---

  const updateClipCurves = useCallback((clipId: string, channel: CurveChannel, points: CurvePoint[]) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const currentGrade = gradeWithDefaults(c.colorGrade);
          return {
            ...c,
            colorGrade: {
              ...currentGrade,
              curves: { ...currentGrade.curves, [channel]: points },
            },
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateClipHSLSecondary = useCallback((clipId: string, updates: Partial<HSLSecondary>) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const currentGrade = gradeWithDefaults(c.colorGrade);
          return {
            ...c,
            colorGrade: {
              ...currentGrade,
              hslSecondary: { ...currentGrade.hslSecondary, ...updates },
            },
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateClipColorWheels = useCallback((clipId: string, wheel: 'shadows' | 'midtones' | 'highlights' | 'global', updates: Partial<ColorWheel>) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const currentGrade = gradeWithDefaults(c.colorGrade);
          return {
            ...c,
            colorGrade: {
              ...currentGrade,
              wheels: { ...currentGrade.wheels, [wheel]: { ...currentGrade.wheels[wheel], ...updates } },
            },
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateHueVsSat = useCallback((clipId: string, points: CurvePoint[]) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const currentGrade = gradeWithDefaults(c.colorGrade);
          return {
            ...c,
            colorGrade: { ...currentGrade, hueVsSat: points },
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateHueVsHue = useCallback((clipId: string, points: CurvePoint[]) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const currentGrade = gradeWithDefaults(c.colorGrade);
          return {
            ...c,
            colorGrade: { ...currentGrade, hueVsHue: points },
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const toggleBeforeAfter = useCallback(() => {
    setBeforeAfterState(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const setBeforeAfterSplit = useCallback((position: number) => {
    setBeforeAfterState(prev => ({ ...prev, splitPosition: Math.max(0, Math.min(1, position)) }));
  }, []);

  const setReferenceClip = useCallback((clipId: string | null) => {
    setBeforeAfterState(prev => ({ ...prev, referenceClipId: clipId }));
  }, []);

  const matchColorFromClip = useCallback((sourceClipId: string, targetClipId: string) => {
    setProject(prev => {
      const source = prev.clips.find(c => c.id === sourceClipId);
      const target = prev.clips.find(c => c.id === targetClipId);
      if (!source || !target || !source.colorGrade) return prev;
      return {
        ...prev,
        clips: prev.clips.map(c => {
          if (c.id === targetClipId) {
            return {
              ...c,
              colorGrade: gradeWithDefaults(source.colorGrade),
            };
          }
          return c;
        })
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  const addClipEffect = useCallback((clipId: string, effect: Omit<import('../types/editor').AppliedEffect, 'id'>) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId) {
          const effects = c.appliedEffects || [];
          const newEffect: import('../types/editor').AppliedEffect = {
            ...effect,
            id: `fx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
          };
          return {
            ...c,
            appliedEffects: [...effects, newEffect]
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const toggleClipEffect = useCallback((clipId: string, effectId: string) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId && c.appliedEffects) {
          return {
            ...c,
            appliedEffects: c.appliedEffects.map(fx => fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx)
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const removeClipEffect = useCallback((clipId: string, effectId: string) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId && c.appliedEffects) {
          return {
            ...c,
            appliedEffects: c.appliedEffects.filter(fx => fx.id !== effectId)
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateClipEffectValue = useCallback((clipId: string, effectId: string, value: number) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId && c.appliedEffects) {
          return {
            ...c,
            appliedEffects: c.appliedEffects.map(fx => fx.id === effectId ? { ...fx, value } : fx)
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateClipEffectParam = useCallback((clipId: string, effectId: string, key: string, value: number | string | boolean) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId && c.appliedEffects) {
          return {
            ...c,
            appliedEffects: c.appliedEffects.map(fx => fx.id === effectId
              ? { ...fx, params: { ...(fx.params || {}), [key]: value } }
              : fx)
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const updateClipEffectKeyframes = useCallback((clipId: string, effectId: string, keyframes: import('../types/editor').EffectKeyframe[]) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.id === clipId && c.appliedEffects) {
          return {
            ...c,
            appliedEffects: c.appliedEffects.map(fx => fx.id === effectId ? { ...fx, keyframes } : fx)
          };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  const addTextTitleClip = useCallback((textProps: import('../types/editor').TextProperties, duration = 5.0) => {
    const newClip: TimelineClip = {
      id: `clip_${Date.now()}_title`,
      assetId: 'sample_title_card.png',
      trackId: 'v2',
      name: textProps.text.slice(0, 20) || 'Title Layer',
      type: 'image',
      color: '#F76FA4',
      startTime: playheadRef.current,
      duration,
      inPoint: 0,
      outPoint: duration,
      speed: 1.0,
      volume: 1.0,
      muted: false,
      opacity: 1.0,
      transform: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      textProperties: textProps
    };

    setProject(prev => ({
      ...prev,
      clips: [...prev.clips, newClip]
    }));
    setSelectedClipId(newClip.id);
    setHasUnsavedChanges(true);
  }, []);

  // --- Smart Tools (AI-style utilities) ---

  const applyMagicEdit = useCallback((prompt: string, clipId?: string): MagicEditPlan => {
    const plan = planMagicEdit(prompt);
    const targetId = clipId || selectedClipId;
    const targetClips = targetId
      ? project.clips.filter(c => c.id === targetId && (c.type === 'video' || c.type === 'image'))
      : project.clips.filter(c => (c.type === 'video' || c.type === 'image') && !c.textProperties);

    for (const clip of targetClips) {
      if (plan.speed !== undefined) {
        updateClipProperties(clip.id, { speed: plan.speed });
      }
      for (const fx of plan.effects ?? []) {
        const existing = clip.appliedEffects?.find(e => e.type === fx.type);
        if (existing) {
          // Re-adapt an already applied matching effect to the new strength
          updateClipEffectValue(clip.id, existing.id, fx.value);
        } else {
          addClipEffect(clip.id, fx);
        }
      }
      if (plan.grade) {
        updateClipColorGrade(clip.id, plan.grade as Partial<import('../types/editor').ColorGrade>);
      }
    }
    return plan;
  }, [project, selectedClipId, updateClipProperties, addClipEffect, updateClipEffectValue, updateClipColorGrade]);

  // Remove a Magic Edit / cinematic look from the target clip(s): resets the
  // color grade to neutral, removes look-specific effects and restores speed.
  const removeMagicLook = useCallback((clipId?: string) => {
    const LOOK_EFFECT_TYPES: string[] = ['blur', 'glow', 'glitch', 'cameraShake', 'slowZoom'];
    const targetId = clipId || selectedClipId;
    const targetClips = targetId
      ? project.clips.filter(c => c.id === targetId && (c.type === 'video' || c.type === 'image'))
      : project.clips.filter(c => (c.type === 'video' || c.type === 'image') && !c.textProperties);

    for (const clip of targetClips) {
      for (const fx of clip.appliedEffects ?? []) {
        if (LOOK_EFFECT_TYPES.includes(fx.type)) {
          removeClipEffect(clip.id, fx.id);
        }
      }
      updateClipProperties(clip.id, {
        speed: 1,
        colorGrade: { ...DEFAULT_GRADE },
      });
    }
    setHasUnsavedChanges(true);
    return targetClips.length;
  }, [project, selectedClipId, removeClipEffect, updateClipProperties]);

  // Whether any target clip currently carries a Magic Edit look (grade, look
  // effects or changed speed) — used to enable the "Remove Look" button.
  const hasMagicLook = useCallback((clipId?: string): boolean => {
    const LOOK_EFFECT_TYPES: string[] = ['blur', 'glow', 'glitch', 'cameraShake', 'slowZoom'];
    const targetId = clipId || selectedClipId;
    const targetClips = targetId
      ? project.clips.filter(c => c.id === targetId && (c.type === 'video' || c.type === 'image'))
      : project.clips.filter(c => (c.type === 'video' || c.type === 'image') && !c.textProperties);
    return targetClips.some(c => {
      const g = c.colorGrade;
      const gradeTouched = !!g && (
        g.lut !== 'None' ||
        (g.temperature ?? 0) !== 0 || (g.tint ?? 0) !== 0 || (g.exposure ?? 0) !== 0 ||
        (g.contrast ?? 0) !== 0 || (g.vignette ?? 0) !== 0 || (g.highlights ?? 0) !== 0 ||
        (g.shadows ?? 0) !== 0 || (g.whites ?? 0) !== 0 || (g.blacks ?? 0) !== 0 ||
        (g.saturation ?? 100) !== 100 ||
        (g.wheels?.shadows?.magnitude ?? 0) !== 0 || (g.wheels?.midtones?.magnitude ?? 0) !== 0 ||
        (g.wheels?.highlights?.magnitude ?? 0) !== 0 || (g.wheels?.global?.magnitude ?? 0) !== 0 ||
        !!g.hslSecondary?.enabled);
      const lookFx = c.appliedEffects?.some(e => LOOK_EFFECT_TYPES.includes(e.type));
      return gradeTouched || lookFx || (c.speed ?? 1) !== 1;
    });
  }, [project, selectedClipId]);

  // Convert the whole sequence into a vertical 9:16 Short / Reel:
  // resizes the sequence and auto-zooms every video/image clip so footage
  // covers the vertical frame with the subject centered. The original
  // sequence size and clip transforms are saved so this can be removed.
  const convertToShort = useCallback(() => {
    setProject(prev => {
      const W = 1080;
      const H = 1920;
      const assetMap = new Map(prev.assets.map(a => [a.id, a]));

      // Keep the first snapshot so re-running the conversion never overwrites
      // the true original project size / transforms.
      const transforms: Record<string, { x: number; y: number; scale: number; rotation: number }> = {
        ...(prev.shortFormat?.transforms || {}),
      };
      for (const c of prev.clips) {
        if (c.type !== 'video' && c.type !== 'image') continue;
        if (transforms[c.id]) continue;
        transforms[c.id] = { ...c.transform };
      }

      return {
        ...prev,
        width: W,
        height: H,
        shortFormat: prev.shortFormat || {
          width: prev.width,
          height: prev.height,
          appliedAt: new Date().toISOString(),
          transforms,
        },
        updatedAt: new Date().toISOString(),
        clips: prev.clips.map(c => {
          if (c.type !== 'video' && c.type !== 'image') return c;
          const asset = assetMap.get(c.assetId);
          const srcW = asset?.width || 1920;
          const srcH = asset?.height || 1080;
          // The monitor draws "fit" then multiplies by transform.scale,
          // so the cover-fill multiplier is cover/fit.
          const fit = Math.min(W / srcW, H / srcH);
          const cover = Math.max(W / srcW, H / srcH);
          const scale = cover / fit;
          return {
            ...c,
            transform: { ...c.transform, x: 0, y: 0, scale },
          };
        }),
      };
    });
    setSelectedClipId(null);
    setSelectedClipIds([]);
    setHasUnsavedChanges(true);
  }, []);

  // Remove the 9:16 conversion: restore the original sequence size and every
  // clip transform that was captured before Convert to Short ran.
  const removeShortFormat = useCallback(() => {
    setProject(prev => {
      if (!prev.shortFormat) return prev;
      const saved = prev.shortFormat.transforms;
      return {
        ...prev,
        width: prev.shortFormat.width,
        height: prev.shortFormat.height,
        shortFormat: undefined,
        updatedAt: new Date().toISOString(),
        clips: prev.clips.map(c => {
          if (c.type !== 'video' && c.type !== 'image') return c;
          const original = saved[c.id];
          if (original) {
            return { ...c, transform: { ...c.transform, ...original } };
          }
          // Clips added while in Short mode have no saved transform — reset
          // them to normal framing instead of leaving them cover-zoomed.
          return { ...c, transform: { ...c.transform, x: 0, y: 0, scale: 1 } };
        }),
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  const isShortFormat = Boolean(project.shortFormat) && project.width === 1080 && project.height === 1920;

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        if (data.assets && data.assets.length > 0) {
          setProject(prev => ({
            ...prev,
            assets: [...prev.assets, ...data.assets]
          }));
        }
      }
    } catch (e) {
      console.error('File upload error:', e);
    }
  }, []);

  const saveProject = useCallback(async () => {
    try {
      const res = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      if (res.ok) {
        setHasUnsavedChanges(false);
        // Also trigger JSON download as .prproj.json for user convenience
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', `${project.name.replace(/\s+/g, '_')}.prproj.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        return true;
      }
    } catch (e) {
      console.error('Save project error:', e);
    }
    return false;
  }, [project]);

  const loadProjectData = useCallback((loadedProj: Project) => {
    setProject(loadedProj);
    setPlayhead(0);
    setSelectedClipId(null);
    setSelectedClipIds([]);
    setHasUnsavedChanges(false);
  }, []);

  const createNewProject = useCallback((name: string, width = 1920, height = 1080, fps = 30) => {
    const newProj: Project = {
      ...DEFAULT_PROJECT,
      id: `proj_${Date.now()}`,
      name: name || 'Untitled Sequence 01',
      width,
      height,
      fps,
      duration: 20,
      clips: [],
      tracks: INITIAL_TRACKS,
      assets: project.assets,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setProject(newProj);
    setPlayhead(0);
    setSelectedClipId(null);
    setSelectedClipIds([]);
    setHasUnsavedChanges(false);
  }, [project.assets]);

  // Marker management
  const addMarker = useCallback((time: number, label: string = 'Marker', color: string = '#f1c40f') => {
    setMarkers(prev => {
      const exists = prev.find(m => Math.abs(m.time - time) < 0.05);
      if (exists) return prev;
      const newMarker: Marker = {
        id: `marker_${Date.now()}`,
        time,
        label,
        color,
      };
      return [...prev, newMarker].sort((a, b) => a.time - b.time);
    });
    setHasUnsavedChanges(true);
  }, []);

  const deleteMarker = useCallback((markerId: string) => {
    setMarkers(prev => prev.filter(m => m.id !== markerId));
    setHasUnsavedChanges(true);
  }, []);

  const editMarker = useCallback((markerId: string, updates: Partial<Marker>) => {
    setMarkers(prev => prev.map(m => (m.id === markerId ? { ...m, ...updates } : m)));
    setHasUnsavedChanges(true);
  }, []);

  const goToNextMarker = useCallback(() => {
    setPlayhead(prev => {
      const next = markers.find(m => m.time > prev + 0.05);
      return next ? next.time : prev;
    });
  }, [markers, setPlayhead]);

  const goToPreviousMarker = useCallback(() => {
    setPlayhead(prev => {
      const previous = [...markers].reverse().find(m => m.time < prev - 0.05);
      return previous ? previous.time : prev;
    });
  }, [markers, setPlayhead]);

  const clearMarkers = useCallback(() => {
    setMarkers([]);
    setHasUnsavedChanges(true);
  }, []);

  // Panel visibility
  const togglePanel = useCallback((panel: keyof PanelVisibility) => {
    setPanelVisibility(prev => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const setPanels = useCallback((visibility: Partial<PanelVisibility>) => {
    setPanelVisibility(prev => ({ ...prev, ...visibility }));
  }, []);

  // Fullscreen
  const toggleFullscreenApp = useCallback(() => {
    setFullscreen(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      return next;
    });
  }, []);

  // View settings
  const updateViewSetting = useCallback((key: keyof ViewSettings, value: any) => {
    setViewSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // --- Web Audio API Playback Actions ---

  const initAudio = useCallback(async () => {
    if (audioInitialized) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterGainRef.current = masterGain;

      const splitter = ctx.createChannelSplitter(2);
      const analyserLeft = ctx.createAnalyser();
      const analyserRight = ctx.createAnalyser();
      analyserLeft.fftSize = 256;
      analyserRight.fftSize = 256;
      analyserLeftRef.current = analyserLeft;
      analyserRightRef.current = analyserRight;

      masterGain.connect(ctx.destination);
      masterGain.connect(splitter);
      splitter.connect(analyserLeft, 0);
      splitter.connect(analyserRight, 1);

      const nodes: AudioTrackNode[] = project.tracks
        .filter(t => t.type === 'audio')
        .map(track => {
          const gain = ctx.createGain();
          gain.gain.value = track.volume || 1.0;
          const pan = ctx.createStereoPanner();
          pan.pan.value = track.pan || 0;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          gain.connect(pan);
          pan.connect(analyser);
          analyser.connect(masterGain);
          return { trackId: track.id, gainNode: gain, panNode: pan, analyser };
        });

      const buses: AudioBus[] = [
        { id: 'bus_master', name: 'Master', trackIds: [], gainNode: masterGain, volume: 1.0, muted: false, solo: false },
      ];

      setTrackNodes(nodes);
      setBusNodes(buses);
      setAudioInitialized(true);
    } catch (err) {
      console.warn('Web Audio API initialization failed:', err);
    }
  }, [audioInitialized, project.tracks]);

  const decodeAudioBuffer = useCallback(async (asset: MediaAsset): Promise<AudioBuffer | null> => {
    if (bufferCache[asset.id]) return bufferCache[asset.id];
    if (!audioCtxRef.current) return null;
    try {
      const response = await fetch(asset.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setBufferCache(prev => ({ ...prev, [asset.id]: audioBuffer }));
      return audioBuffer;
    } catch (err) {
      console.error('Failed to decode audio buffer:', err);
      return null;
    }
  }, [bufferCache]);

  const scheduleClipInstances = useCallback((playheadTime: number) => {
    if (!audioCtxRef.current || !masterGainRef.current) return;
    const ctx = audioCtxRef.current;
    const currentTime = ctx.currentTime;

    instancesRef.current.forEach(inst => {
      if (!inst.isPlaying) return;
      if (inst.stopTime && currentTime >= inst.stopTime) {
        try { inst.source?.stop(); } catch (e) {}
        inst.isPlaying = false;
        return;
      }
      const clip = projectClipsRef.current.find(c => c.id === inst.clipId);
      if (!clip) return;
      const localTime = (inst.offsetInClip || 0) + Math.max(0, currentTime - inst.startTime);
      inst.gainNode?.gain.setValueAtTime(getClipGainAt(clip, localTime), currentTime);
      inst.panNode?.pan.setValueAtTime(clip.pan ?? 0, currentTime);
    });

    const audioClips = projectClipsRef.current.filter(c => (c.type === 'audio' || c.type === 'video') && !c.muted);
    const trackMap = new Map(trackNodes.map(n => [n.trackId, n]));
    const newInstances: AudioClipInstance[] = [];

    for (const clip of audioClips) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      if (playheadTime >= clipStart && playheadTime < clipEnd) {
        const existing = instancesRef.current.find(i => i.clipId === clip.id && i.isPlaying);
        if (existing) { newInstances.push(existing); continue; }

        const asset = project.assets.find(a => a.id === clip.assetId);
        if (!asset) continue;

        decodeAudioBuffer(asset).then(buffer => {
          if (!buffer || !audioCtxRef.current) return;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gainNode = ctx.createGain();
          const panNode = ctx.createStereoPanner();
          panNode.pan.value = clip.pan ?? 0;
          const offsetInClip = playheadTime - clipStart;
          gainNode.gain.value = getClipGainAt(clip, offsetInClip);

          // Real audio-effect chain for preview playback. Mirrors the export
          // filters so what you hear matches the rendered file.
          const fxNodes: AudioNode[] = [];
          const lfos: OscillatorNode[] = [];
          let head: AudioNode = source;
          for (const fx of clip.appliedEffects || []) {
            if (!fx.enabled || fx.category !== 'audio') continue;
            if (fx.type === 'highPass' || fx.type === 'lowPass') {
              const filter = ctx.createBiquadFilter();
              filter.type = fx.type === 'highPass' ? 'highpass' : 'lowpass';
              filter.frequency.value = fx.type === 'highPass'
                ? Math.max(60, Math.min(220, fx.value || 80))
                : Math.max(9000, Math.min(20000, fx.value || 15000));
              filter.Q.value = 0.7;
              head.connect(filter);
              head = filter;
              fxNodes.push(filter);
            } else if (fx.type === 'eq') {
              const filter = ctx.createBiquadFilter();
              filter.type = 'peaking';
              filter.frequency.value = 3200;
              filter.Q.value = 1.2;
              filter.gain.value = (fx.value - 50) / 10; // ±5 dB
              head.connect(filter);
              head = filter;
              fxNodes.push(filter);
            } else if (fx.type === 'bassBoost') {
              const filter = ctx.createBiquadFilter();
              filter.type = 'lowshelf';
              filter.frequency.value = 200;
              filter.gain.value = 3 + (fx.value / 100) * 9; // +3..+12 dB
              head.connect(filter);
              head = filter;
              fxNodes.push(filter);
            } else if (fx.type === 'compressor') {
              const comp = ctx.createDynamicsCompressor();
              comp.threshold.value = -24;
              comp.ratio.value = 4;
              comp.attack.value = 0.005;
              comp.release.value = 0.05;
              head.connect(comp);
              head = comp;
              fxNodes.push(comp);
            } else if (fx.type === 'loudnessNorm') {
              // Preview approximation of the export's loudnorm filter: level
              // peaks and add make-up gain so normalization is audible live.
              const comp = ctx.createDynamicsCompressor();
              comp.threshold.value = -24;
              comp.knee.value = 12;
              comp.ratio.value = 4;
              comp.attack.value = 0.004;
              comp.release.value = 0.2;
              const makeup = ctx.createGain();
              makeup.gain.value = 1.5;
              head.connect(comp);
              comp.connect(makeup);
              head = makeup;
              fxNodes.push(comp, makeup);
            } else if (fx.type === 'distortion') {
              const shaper = ctx.createWaveShaper();
              const amt = Math.max(0, Math.min(1, (fx.value || 30) / 100));
              const curve = new Float32Array(1024);
              for (let i = 0; i < curve.length; i++) {
                const xx = (i / (curve.length - 1)) * 2 - 1;
                curve[i] = Math.tanh(xx * (1 + amt * 8));
              }
              shaper.curve = curve;
              head.connect(shaper);
              head = shaper;
              fxNodes.push(shaper);
            } else if (fx.type === 'delay' || fx.type === 'reverb') {
              // Echo-based delay / reverb approximation.
              const isReverb = fx.type === 'reverb';
              const delay = ctx.createDelay(2);
              delay.delayTime.value = isReverb
                ? 0.09
                : Math.max(0.02, Math.min(1.5, ((fx.params?.delayTime as number) || 300) / 1000));
              const fb = ctx.createGain();
              fb.gain.value = isReverb
                ? 0.35
                : Math.max(0, Math.min(0.9, ((fx.params?.feedback as number) || 30) / 100));
              const mix = ctx.createGain();
              mix.gain.value = Math.max(0, Math.min(1, ((fx.params?.mix as number) ?? (fx.value || 30)) / 100));
              const merge = ctx.createGain();
              head.connect(merge);      // dry
              head.connect(delay);      // wet
              delay.connect(fb);
              fb.connect(delay);
              delay.connect(mix);
              mix.connect(merge);
              head = merge;
              fxNodes.push(delay, fb, mix, merge);
            } else if (fx.type === 'flanger' || fx.type === 'phaser') {
              const delay = ctx.createDelay(0.1);
              delay.delayTime.value = 0.005;
              const depth = ctx.createGain();
              depth.gain.value = 0.002 + ((fx.params?.depth as number) || 30) / 100 * 0.004;
              const lfo = ctx.createOscillator();
              lfo.frequency.value = 0.1 + ((fx.params?.rate as number) || 30) / 100 * 4;
              lfo.connect(depth);
              depth.connect(delay.delayTime);
              lfo.start();
              lfos.push(lfo);
              const mix = ctx.createGain();
              mix.gain.value = 0.5;
              const merge = ctx.createGain();
              head.connect(merge);
              head.connect(delay);
              delay.connect(mix);
              mix.connect(merge);
              head = merge;
              fxNodes.push(delay, depth, mix, merge);
            }
          }
          head.connect(gainNode);
          gainNode.connect(panNode);
          const trackNode = trackMap.get(clip.trackId);
          if (trackNode) {
            panNode.connect(trackNode.gainNode);
          } else {
            panNode.connect(masterGainRef.current!);
          }

          const durationToPlay = clipEnd - playheadTime;
          source.start(ctx.currentTime, offsetInClip, durationToPlay);
          source.onended = () => {
            lfos.forEach(l => { try { l.stop(); } catch (e) {} });
            fxNodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
          };

          const instance: AudioClipInstance = {
            clipId: clip.id,
            source,
            gainNode,
            panNode,
            startTime: ctx.currentTime,
            stopTime: ctx.currentTime + durationToPlay,
            offsetInClip,
            isPlaying: true,
          };
          newInstances.push(instance);
        });
      }
    }

    setActiveInstances(newInstances);
  }, [playhead, project.clips, project.assets, trackNodes, bufferCache, decodeAudioBuffer]);

  const startPlayback = useCallback(() => {
    if (!audioInitialized) { initAudio(); }
    setIsPlaying(true);
    scheduleClipInstances(playhead);
    startPlaybackLoop();
  }, [audioInitialized, initAudio, playhead, scheduleClipInstances]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackLoopRef.current) {
      cancelAnimationFrame(playbackLoopRef.current);
      playbackLoopRef.current = null;
    }
    instancesRef.current.forEach(inst => {
      if (inst.isPlaying) { try { inst.source?.stop(); } catch (e) {} inst.isPlaying = false; }
    });
    setActiveInstances([]);
  }, []);

  const startPlaybackLoop = useCallback(() => {
    if (!isPlayingRef.current) return;
    const loop = () => {
      if (!isPlayingRef.current) return;
      scheduleClipInstances(playhead);
      updateLoudness();
      playbackLoopRef.current = requestAnimationFrame(loop);
    };
    playbackLoopRef.current = requestAnimationFrame(loop);
  }, [isPlayingRef, playhead, scheduleClipInstances]);

  const updateLoudness = useCallback(() => {
    if (!analyserLeftRef.current) return;
    const data = new Float32Array(analyserLeftRef.current.fftSize);
    analyserLeftRef.current.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) { peak = Math.max(peak, Math.abs(data[i])); }
    const db = peak <= 0.0001 ? -60 : 20 * Math.log10(peak);
    setLoudness(prev => ({
      ...prev,
      momentaryLUFS: Math.max(-60, Math.min(6, db)),
      shortTermLUFS: Math.max(-60, Math.min(6, db)),
      integratedLUFS: Math.max(-60, Math.min(6, db)),
      truePeak: Math.max(-60, Math.min(6, db)),
      lra: 0,
      updatedAt: Date.now(),
    }));
  }, []);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, volume } : t))
    }));
    const node = trackNodes.find(n => n.trackId === trackId);
    if (node && node.gainNode) {
      node.gainNode.gain.setValueAtTime(Math.max(0, Math.min(2.0, volume)), audioCtxRef.current?.currentTime || 0);
    }
  }, [trackNodes]);

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, pan } : t))
    }));
    const node = trackNodes.find(n => n.trackId === trackId);
    if (node && node.panNode) {
      node.panNode.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), audioCtxRef.current?.currentTime || 0);
    }
  }, [trackNodes]);

  const setBusVolume = useCallback((busId: string, volume: number) => {
    setBusNodes(prev => prev.map(b => b.id === busId ? { ...b, volume: Math.max(0, Math.min(2.0, volume)) } : b));
    const bus = busNodes.find(b => b.id === busId);
    if (bus?.gainNode) {
      bus.gainNode.gain.setValueAtTime(Math.max(0, Math.min(2.0, volume)), audioCtxRef.current?.currentTime || 0);
    }
  }, [busNodes]);

  const toggleTrackMute = useCallback((trackId: string) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, muted: !t.muted } : t))
    }));
    const node = trackNodes.find(n => n.trackId === trackId);
    if (node && node.gainNode) {
      node.gainNode.gain.setValueAtTime(node.gainNode.gain.value === 0 ? 1 : 0, audioCtxRef.current?.currentTime || 0);
    }
  }, [trackNodes]);

  const toggleTrackSolo = useCallback((trackId: string) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => (t.id === trackId ? { ...t, solo: !t.solo } : t))
    }));
    project.tracks.forEach(t => {
      if (t.id !== trackId && t.type === 'audio') {
        const node = trackNodes.find(n => n.trackId === t.id);
        if (node && node.gainNode) { node.gainNode.gain.setValueAtTime(0, audioCtxRef.current?.currentTime || 0); }
      }
    });
  }, [trackNodes, project.tracks]);

  // When tracks are added after the audio engine is initialized, create their
  // gain/pan nodes so volume, mute and solo work on the new tracks too.
  useEffect(() => {
    if (!audioInitialized || !audioCtxRef.current || !masterGainRef.current) return;
    const ctx = audioCtxRef.current;
    const newNodeDefs = project.tracks.filter(t =>
      t.type === 'audio' && !trackNodes.some(n => n.trackId === t.id));
    if (newNodeDefs.length === 0) return;
    const nodes: AudioTrackNode[] = newNodeDefs.map(track => {
      const gain = ctx.createGain();
      gain.gain.value = track.volume || 1.0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan || 0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(pan);
      pan.connect(analyser);
      analyser.connect(masterGainRef.current!);
      return { trackId: track.id, gainNode: gain, panNode: pan, analyser };
    });
    setTrackNodes(prev => [...prev, ...nodes]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioInitialized, project.tracks]);

  const decodeAllAudioBuffers = useCallback(async () => {
    const audioAssets = project.assets.filter(a => a.type === 'audio');
    for (const asset of audioAssets) { await decodeAudioBuffer(asset); }
  }, [project.assets, decodeAudioBuffer]);

  // --- Graphics / Motion Graphics Actions ---

  const addShapeLayer = useCallback((shape: Omit<ShapeLayer, 'id'>) => {
    const newShape: ShapeLayer = { ...shape, id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` };
    setShapeLayers(prev => [...prev, newShape]);
    setSelectedShapeId(newShape.id);
    setHasUnsavedChanges(true);
  }, []);

  const updateShapeLayer = useCallback((shapeId: string, updates: Partial<ShapeLayer>) => {
    setShapeLayers(prev => prev.map(s => (s.id === shapeId ? { ...s, ...updates } : s)));
    setHasUnsavedChanges(true);
  }, []);

  const deleteShapeLayer = useCallback((shapeId: string) => {
    setShapeLayers(prev => prev.filter(s => s.id !== shapeId));
    setSelectedShapeId(prev => (prev === shapeId ? null : prev));
    setHasUnsavedChanges(true);
  }, []);

  const clearClipText = useCallback((clipId: string) => {
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => (c.id === clipId ? { ...c, textProperties: undefined } : c))
    }));
    setHasUnsavedChanges(true);
  }, []);

  const addTextAnimation = useCallback((animation: Omit<TextAnimation, 'id'>) => {
    const newAnim: TextAnimation = { ...animation, id: `anim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` };
    setTextAnimations(prev => [...prev, newAnim]);
    setHasUnsavedChanges(true);
  }, []);

  // Add animated captions as stacked text clips on V2 with a typewriter animation.
  const addCaptions = useCallback((
    lines: string[],
    startAt: number,
    perLineDuration: number,
    position?: { x: number; y: number }
  ) => {
    const clean = lines.map(l => l.trim()).filter(Boolean);
    if (clean.length === 0) return;
    const dur = Math.max(0.5, perLineDuration);
    setProject(prev => {
      const baseId = `cap_${Date.now()}`;
      const captionClips: TimelineClip[] = clean.map((line, i) => ({
        id: `${baseId}_${i}_${Math.random().toString(36).substring(2, 5)}`,
        assetId: 'sample_title_card.png',
        trackId: 'v2',
        name: line.slice(0, 28) || `Caption ${i + 1}`,
        type: 'image',
        color: '#F76FA4',
        startTime: startAt + i * dur,
        duration: dur,
        inPoint: 0,
        outPoint: dur,
        speed: 1.0,
        volume: 1.0,
        muted: false,
        opacity: 1.0,
        transform: { x: position?.x ?? 0, y: position?.y ?? 0, scale: 1.0, rotation: 0 },
        textProperties: {
          text: line,
          fontFamily: 'Inter',
          fontSize: 56,
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.45)',
          align: 'center',
          isCaption: true,
          captionGroupId: baseId,
        },
      }));
      return { ...prev, clips: [...prev.clips, ...captionClips] };
    });
    addTextAnimation({ type: 'typewriter', duration: 0.6, easing: 'linear', delay: 0, enabled: true });
    setHasUnsavedChanges(true);
  }, [addTextAnimation]);

  const updateTextAnimation = useCallback((animId: string, updates: Partial<TextAnimation>) => {
    setTextAnimations(prev => prev.map(a => (a.id === animId ? { ...a, ...updates } : a)));
    setHasUnsavedChanges(true);
  }, []);

  const addEssentialProperty = useCallback((prop: Omit<EssentialProperty, 'id'>) => {
    const newProp: EssentialProperty = { ...prop, id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` };
    setEssentialProperties(prev => [...prev, newProp]);
    setHasUnsavedChanges(true);
  }, []);

  const updateEssentialProperty = useCallback((propId: string, value: any) => {
    setEssentialProperties(prev => prev.map(p => (p.id === propId ? { ...p, value } : p)));
    // Apply the value to the target clip's property path
    setHasUnsavedChanges(true);
  }, []);

  const loadGraphicsTemplates = useCallback(() => {
    const templates: MotionGraphicsTemplate[] = [      {
        id: 'tpl_lower_third_1',
        name: 'Modern Lower Third',
        category: 'lower-third',
        description: 'Clean lower third with name and title',
        thumbnailColor: '#1473e6',
        defaultText: 'John Doe\nSenior Editor',
        defaultFontFamily: 'Inter',
        defaultFontSize: 44,
        defaultColor: '#ffffff',
        defaultBackgroundColor: 'rgba(20, 115, 230, 0.85)',
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'rectangle',
            x: 0, y: 0, width: 400, height: 100,
            fillColor: '#1473e6', fillOpacity: 0.85,
            strokeColor: null, strokeWidth: 0,
            cornerRadius: 8, rotation: 0, opacity: 1,
            pin: 'bottom-left', pinOffset: { x: 40, y: 40 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'slide-left', duration: 0.5, easing: 'ease-out', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Name', propertyPath: 'textProperties.text', value: 'John Doe', exposedToInstance: true },
          { id: 'prop_2', name: 'Title', propertyPath: 'textProperties.text', value: 'Senior Editor', exposedToInstance: true },
          { id: 'prop_3', name: 'Accent Color', propertyPath: 'shapeLayers[0].fillColor', value: '#1473e6', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_end_screen_1',
        name: 'End Screen',
        category: 'end-screen',
        description: 'Subscribe and watch more end card',
        thumbnailColor: '#e74c3c',
        defaultText: 'SUBSCRIBE\nWATCH MORE',
        defaultFontFamily: 'Impact',
        defaultFontSize: 72,
        defaultColor: '#ffffff',
        defaultBackgroundColor: 'rgba(0, 0, 0, 0.7)',
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'rectangle',
            x: 0, y: 0, width: 300, height: 300,
            fillColor: '#e74c3c', fillOpacity: 0.9,
            strokeColor: null, strokeWidth: 0,
            cornerRadius: 20, rotation: 0, opacity: 1,
            pin: 'bottom-right', pinOffset: { x: 40, y: 40 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'fade-in', duration: 0.8, easing: 'ease-out', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'CTA Text', propertyPath: 'textProperties.text', value: 'SUBSCRIBE', exposedToInstance: true },
          { id: 'prop_2', name: 'Button Color', propertyPath: 'shapeLayers[0].fillColor', value: '#e74c3c', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_social_story_1',
        name: 'Social Media Story',
        category: 'social',
        description: 'Instagram/TikTok story overlay',
        thumbnailColor: '#f093fb',
        defaultText: 'SWIPE UP',
        defaultFontFamily: 'Arial',
        defaultFontSize: 64,
        defaultColor: '#ffffff',
        defaultBackgroundColor: null,
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'circle',
            x: 0, y: 0, width: 120, height: 120,
            fillColor: '#f093fb', fillOpacity: 0.9,
            strokeColor: '#ffffff', strokeWidth: 4,
            cornerRadius: 60, rotation: 0, opacity: 1,
            pin: 'center', pinOffset: { x: 0, y: -100 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'bounce', duration: 0.6, easing: 'ease-out', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Text', propertyPath: 'textProperties.text', value: 'SWIPE UP', exposedToInstance: true },
          { id: 'prop_2', name: 'Color', propertyPath: 'shapeLayers[0].fillColor', value: '#f093fb', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_news_ticker_1',
        name: 'News Ticker',
        category: 'news',
        description: 'Breaking news lower third ticker',
        thumbnailColor: '#e74c3c',
        defaultText: 'BREAKING NEWS: Major developments unfolding',
        defaultFontFamily: 'Arial',
        defaultFontSize: 32,
        defaultColor: '#ffffff',
        defaultBackgroundColor: 'rgba(231, 76, 60, 0.95)',
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'rectangle',
            x: 0, y: 0, width: 1920, height: 60,
            fillColor: '#e74c3c', fillOpacity: 0.95,
            strokeColor: null, strokeWidth: 0,
            cornerRadius: 0, rotation: 0, opacity: 1,
            pin: 'bottom-left', pinOffset: { x: 0, y: 0 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'slide-left', duration: 8.0, easing: 'linear', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Headline', propertyPath: 'textProperties.text', value: 'BREAKING NEWS', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_sports_score_1',
        name: 'Sports Score Bug',
        category: 'sports',
        description: 'Live sports score overlay',
        thumbnailColor: '#2ecc71',
        defaultText: 'HOME 24\nAWAY 17',
        defaultFontFamily: 'Impact',
        defaultFontSize: 48,
        defaultColor: '#ffffff',
        defaultBackgroundColor: 'rgba(46, 204, 113, 0.9)',
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'rectangle',
            x: 0, y: 0, width: 250, height: 80,
            fillColor: '#2ecc71', fillOpacity: 0.9,
            strokeColor: null, strokeWidth: 0,
            cornerRadius: 10, rotation: 0, opacity: 1,
            pin: 'top-left', pinOffset: { x: 40, y: 40 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'fade-in', duration: 0.4, easing: 'ease-out', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Home Score', propertyPath: 'textProperties.text', value: 'HOME 24', exposedToInstance: true },
          { id: 'prop_2', name: 'Away Score', propertyPath: 'textProperties.text', value: 'AWAY 17', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_wedding_title_1',
        name: 'Wedding Title',
        category: 'wedding',
        description: 'Elegant wedding title card',
        thumbnailColor: '#f8fafc',
        defaultText: 'Sarah & Michael',
        defaultFontFamily: 'Georgia',
        defaultFontSize: 84,
        defaultColor: '#f0f0f0',
        defaultBackgroundColor: 'rgba(0, 0, 0, 0.4)',
        defaultShapes: [],
        defaultAnimation: {
          id: 'anim_1', type: 'fade-in', duration: 1.0, easing: 'ease-in-out', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Couple Names', propertyPath: 'textProperties.text', value: 'Sarah & Michael', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_corporate_intro_1',
        name: 'Corporate Intro',
        category: 'corporate',
        description: 'Professional company introduction',
        thumbnailColor: '#3498db',
        defaultText: 'ACME CORPORATION\nExcellence in Motion',
        defaultFontFamily: 'Inter',
        defaultFontSize: 56,
        defaultColor: '#ffffff',
        defaultBackgroundColor: 'rgba(52, 152, 219, 0.9)',
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'rectangle',
            x: 0, y: 0, width: 80, height: 80,
            fillColor: '#f093fb', fillOpacity: 1,
            strokeColor: null, strokeWidth: 0,
            cornerRadius: 20, rotation: 0, opacity: 1,
            pin: 'top-left', pinOffset: { x: 60, y: 40 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'scale-up', duration: 0.6, easing: 'ease-out', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Company Name', propertyPath: 'textProperties.text', value: 'ACME CORPORATION', exposedToInstance: true },
          { id: 'prop_2', name: 'Tagline', propertyPath: 'textProperties.text', value: 'Excellence in Motion', exposedToInstance: true },
        ],
      },
      {
        id: 'tpl_instagram_reel_1',
        name: 'Instagram Reel Title',
        category: 'instagram',
        description: 'Trendy vertical reel title',
        thumbnailColor: '#ff0055',
        defaultText: 'REEL TITLE HERE',
        defaultFontFamily: 'Impact',
        defaultFontSize: 72,
        defaultColor: '#ffffff',
        defaultBackgroundColor: 'rgba(255, 0, 85, 0.8)',
        defaultShapes: [
          {
            id: 'shape_1',
            type: 'rectangle',
            x: 0, y: 0, width: 60, height: 600,
            fillColor: '#ff0055', fillOpacity: 0.8,
            strokeColor: null, strokeWidth: 0,
            cornerRadius: 4, rotation: 0, opacity: 1,
            pin: 'top-left', pinOffset: { x: 40, y: 40 },
          },
        ],
        defaultAnimation: {
          id: 'anim_1', type: 'glitch', duration: 0.3, easing: 'linear', delay: 0, enabled: true,
        },
        essentialProperties: [
          { id: 'prop_1', name: 'Title', propertyPath: 'textProperties.text', value: 'REEL TITLE HERE', exposedToInstance: true },
        ],
      },
    ];
    setGraphicsTemplates(templates);
  }, []);

  // --- Export Actions ---

  const addExportJob = useCallback((job: Omit<ExportJob, 'id' | 'queuePosition' | 'createdAt'>) => {
    const newJob: ExportJob = {
      ...job,
      id: `export_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      queuePosition: exportQueue.length + 1,
      createdAt: Date.now(),
    };
    setExportQueue(prev => [...prev, newJob]);
    setHasUnsavedChanges(true);
    return newJob.id;
  }, [exportQueue]);

  const updateExportJob = useCallback((jobId: string, updates: Partial<ExportJob>) => {
    setExportQueue(prev => prev.map(j => (j.id === jobId ? { ...j, ...updates } : j)));
  }, []);

  const removeExportJob = useCallback((jobId: string) => {
    setExportQueue(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const addToExportHistory = useCallback((item: Omit<ExportHistoryItem, 'id'>) => {
    const newItem: ExportHistoryItem = {
      ...item,
      id: `history_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setExportHistory(prev => [newItem, ...prev].slice(0, 50));
  }, []);

  const clearExportQueue = useCallback(() => {
    setExportQueue([]);
  }, []);

  // --- Phase 7: Professional Features Actions ---

  // Adjustment Layers
  const addAdjustmentLayer = useCallback((clipId: string, affectsTracks: string[] = [], opacity: number = 1.0) => {
    const newLayer: AdjustmentLayer = {
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      clipId,
      affectsTracks,
      opacity,
    };
    setAdjustmentLayers(prev => [...prev, newLayer]);
    setHasUnsavedChanges(true);
    return newLayer.id;
  }, []);

  const updateAdjustmentLayer = useCallback((layerId: string, updates: Partial<AdjustmentLayer>) => {
    setAdjustmentLayers(prev => prev.map(l => (l.id === layerId ? { ...l, ...updates } : l)));
    setHasUnsavedChanges(true);
  }, []);

  const removeAdjustmentLayer = useCallback((layerId: string) => {
    setAdjustmentLayers(prev => prev.filter(l => l.id !== layerId));
    setHasUnsavedChanges(true);
  }, []);

  // Nested Sequences
  const addNestedSequence = useCallback((seq: Omit<NestedSequence, 'id' | 'createdAt'>) => {
    const newSeq: NestedSequence = {
      ...seq,
      id: `nested_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setNestedSequences(prev => [...prev, newSeq]);
    setHasUnsavedChanges(true);
    return newSeq.id;
  }, []);

  const updateNestedSequence = useCallback((seqId: string, updates: Partial<NestedSequence>) => {
    setNestedSequences(prev => prev.map(s => (s.id === seqId ? { ...s, ...updates } : s)));
    setHasUnsavedChanges(true);
  }, []);

  const removeNestedSequence = useCallback((seqId: string) => {
    setNestedSequences(prev => prev.filter(s => s.id !== seqId));
    setHasUnsavedChanges(true);
  }, []);

  // Time Remapping
  const addTimeRemapping = useCallback((clipId: string, keyframes: SpeedKeyframe[] = [], reverse: boolean = false) => {
    const newRemap: TimeRemapping = {
      clipId,
      enabled: true,
      speedKeyframes: keyframes,
      reverse,
    };
    setTimeRemappings(prev => [...prev, newRemap]);
    setHasUnsavedChanges(true);
    return newRemap.clipId;
  }, []);

  const updateTimeRemapping = useCallback((clipId: string, updates: Partial<TimeRemapping>) => {
    setTimeRemappings(prev => prev.map(r => (r.clipId === clipId ? { ...r, ...updates } : r)));
    setHasUnsavedChanges(true);
  }, []);

  const removeTimeRemapping = useCallback((clipId: string) => {
    setTimeRemappings(prev => prev.filter(r => r.clipId !== clipId));
    setHasUnsavedChanges(true);
  }, []);

  const addSpeedKeyframe = useCallback((clipId: string, keyframe: Omit<SpeedKeyframe, 'id'>) => {
    const newKf: SpeedKeyframe = {
      ...keyframe,
      id: `skf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setTimeRemappings(prev => prev.map(r => {
      if (r.clipId === clipId) {
        return {
          ...r,
          speedKeyframes: [...r.speedKeyframes, newKf].sort((a, b) => a.time - b.time),
        };
      }
      return r;
    }));
    setHasUnsavedChanges(true);
  }, []);

  // Auto-Save
  const updateAutoSaveSettings = useCallback((settings: Partial<AutoSaveSettings>) => {
    setAutoSaveSettings(prev => ({ ...prev, ...settings }));
  }, []);

  const addAutoSaveVersion = useCallback((version: Omit<AutoSaveVersion, 'id'>) => {
    const newVersion: AutoSaveVersion = {
      ...version,
      id: `autosave_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setAutoSaveVersions(prev => {
      const updated = [newVersion, ...prev].slice(0, autoSaveSettings.maxVersions);
      return updated;
    });
    setAutoSaveSettings(prev => ({ ...prev, lastAutoSave: Date.now() }));
  }, [autoSaveSettings.maxVersions]);

  const removeAutoSaveVersion = useCallback((versionId: string) => {
    setAutoSaveVersions(prev => prev.filter(v => v.id !== versionId));
  }, []);

  const restoreAutoSaveVersion = useCallback((versionId: string) => {
    const version = autoSaveVersions.find(v => v.id === versionId);
    if (!version) return;
    // The actual project data would be loaded from server or stored version
    setHasUnsavedChanges(true);
  }, [autoSaveVersions]);

  // Proxy Settings
  const updateProxySettings = useCallback((settings: Partial<ProxySettings>) => {
    setProxySettings(prev => ({ ...prev, ...settings }));
  }, []);

  const addProxyInfo = useCallback((info: ProxyInfo) => {
    const newInfo: ProxyInfo = { ...info };
    setProxyInfo(prev => [...prev, newInfo]);
  }, []);

  const updateProxyInfo = useCallback((assetId: string, updates: Partial<ProxyInfo>) => {
    setProxyInfo(prev => prev.map(p => (p.assetId === assetId ? { ...p, ...updates } : p)));
  }, []);

  // Multicamera
  const addMulticamSequence = useCallback((seq: Omit<MulticamSequence, 'id'>) => {
    const newSeq: MulticamSequence = {
      ...seq,
      id: `multicam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    setMulticamSequences(prev => [...prev, newSeq]);
    setHasUnsavedChanges(true);
    return newSeq.id;
  }, []);

  const updateMulticamSequence = useCallback((seqId: string, updates: Partial<MulticamSequence>) => {
    setMulticamSequences(prev => prev.map(s => (s.id === seqId ? { ...s, ...updates } : s)));
    setHasUnsavedChanges(true);
  }, []);

  const setMulticamActiveAngle = useCallback((seqId: string, angleId: string | null) => {
    setMulticamSequences(prev => prev.map(s => {
      if (s.id === seqId) {
        return { ...s, activeAngleId: angleId };
      }
      return s;
    }));
    setActiveMulticamId(angleId);
  }, []);

  const removeMulticamSequence = useCallback((seqId: string) => {
    setMulticamSequences(prev => prev.filter(s => s.id !== seqId));
    setHasUnsavedChanges(true);
  }, []);

  // Project Manager - collect files and relink
  const collectProjectFiles = useCallback((_targetDir: string) => {
    // Placeholder for project manager - would copy all media to targetDir
    // and update clip asset paths
    setHasUnsavedChanges(true);
    return { copied: 0, missed: [] };
  }, []);

  const relinkMedia = useCallback((assetId: string, newPath: string) => {
    setProxyInfo(prev => prev.map(p => 
      p.assetId === assetId ? { ...p, proxyPath: newPath } : p
    ));
    // Update clip asset paths
    setProject(prev => ({
      ...prev,
      clips: prev.clips.map(c => {
        if (c.assetId === assetId) {
          return { ...c, assetId: newPath };
        }
        return c;
      })
    }));
    setHasUnsavedChanges(true);
  }, []);

  return (
    <EditorContext.Provider
      value={{
        project,
        setProject,
        activeTool,
        setActiveTool,
        activeWorkspace,
        setActiveWorkspace,
        zoom,
        setZoom,
        isPlaying,
        setIsPlaying,
        playhead,
        seek,
        selectedClipId,
        setSelectedClipId,
        selectedClipIds,
        setSelectedClipIds,
        sourceAsset,
        setSourceAsset,
        sourceInPoint,
        setSourceInPoint,
        sourceOutPoint,
        setSourceOutPoint,
        snappingEnabled,
        setSnappingEnabled,
        isExportModalOpen,
        setIsExportModalOpen,
        isNewProjectModalOpen,
        setIsNewProjectModalOpen,
        isOpenProjectModalOpen,
        setIsOpenProjectModalOpen,
        hasUnsavedChanges,
        togglePlay,
        stepFrames,
        addClipToTimeline,
        moveClip,
        trimClip,
        splitClipAt,
        splitAtPlayhead,
        deleteClip,
        updateClipProperties,
        toggleTrackOutput,
        addTrack,
        removeTrack,
        toggleTrackLock,
        updateClipColorGrade,
        updateClipCurves,
        updateClipHSLSecondary,
        updateClipColorWheels,
        updateHueVsSat,
        updateHueVsHue,
        markers,
        setMarkers,
        addMarker,
        deleteMarker,
        editMarker,
        goToNextMarker,
        goToPreviousMarker,
        clearMarkers,
        viewSettings,
        updateViewSetting,
        panelVisibility,
        togglePanel,
        setPanels,
        fullscreen,
        setFullscreen,
        toggleFullscreen: toggleFullscreenApp,
        beforeAfterState,
        setBeforeAfterState,
        toggleBeforeAfter,
        setBeforeAfterSplit,
        setReferenceClip,
        matchColorFromClip,
        bufferCache,
        activeInstances,
        trackNodes,
        busNodes,
        audioInitialized,
        loudness,
        initAudio,
        decodeAudioBuffer,
        decodeAllAudioBuffers,
        scheduleClipInstances,
        startPlayback,
        stopPlayback,
        startPlaybackLoop,
        updateLoudness,
        setTrackVolume,
        setTrackPan,
        setBusVolume,
        toggleTrackMute,
        toggleTrackSolo,
        addClipEffect,
        toggleClipEffect,
        removeClipEffect,
        updateClipEffectValue,
        updateClipEffectParam,
        updateClipEffectKeyframes,
        addTextTitleClip,
        refreshMediaAssets,
        uploadFiles,
        saveProject,
        loadProjectData,
        createNewProject,
        // Graphics state
        shapeLayers,
        setShapeLayers,
        textAnimations,
        setTextAnimations,
        essentialProperties,
        setEssentialProperties,
        selectedShapeId,
        setSelectedShapeId,
        graphicsTemplates,
        setGraphicsTemplates,
        // Graphics actions
        addShapeLayer,
        updateShapeLayer,
        deleteShapeLayer,
        addTextAnimation,
        updateTextAnimation,
        addEssentialProperty,
        updateEssentialProperty,
        clearClipText,
        loadGraphicsTemplates,
        exportQueue,
        setExportQueue,
        exportHistory,
        setExportHistory,
        exportLocation,
        setExportLocation,
        exportMetadata,
        setExportMetadata,
        exportFormat,
        setExportFormat,
        // Export actions
        addExportJob,
        updateExportJob,
        removeExportJob,
        addToExportHistory,
        clearExportQueue,
        // Phase 7 state
        adjustmentLayers,
        setAdjustmentLayers,
        nestedSequences,
        setNestedSequences,
        timeRemappings,
        setTimeRemappings,
        autoSaveSettings,
        setAutoSaveSettings,
        autoSaveVersions,
        setAutoSaveVersions,
        proxySettings,
        setProxySettings,
        proxyInfo,
        setProxyInfo,
        multicamSequences,
        setMulticamSequences,
        activeMulticamId,
        setActiveMulticamId,
        // Phase 7 actions
        addAdjustmentLayer,
        updateAdjustmentLayer,
        removeAdjustmentLayer,
        addNestedSequence,
        updateNestedSequence,
        removeNestedSequence,
        addTimeRemapping,
        updateTimeRemapping,
        removeTimeRemapping,
        addSpeedKeyframe,
        updateAutoSaveSettings,
        addAutoSaveVersion,
        removeAutoSaveVersion,
        restoreAutoSaveVersion,
        updateProxySettings,
        addProxyInfo,
        updateProxyInfo,
        addMulticamSequence,
        updateMulticamSequence,
        setMulticamActiveAngle,
        removeMulticamSequence,
        collectProjectFiles,
        relinkMedia,
        undo,
        redo,
        canUndo: historyCounts.undo > 0,
        canRedo: historyCounts.redo > 0,
        applyMagicEdit,
        removeMagicLook,
        hasMagicLook,
        convertToShort,
        removeShortFormat,
        isShortFormat,
        addCaptions,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
};
