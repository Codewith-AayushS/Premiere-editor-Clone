import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor } from '../../context/EditorContext';
import type { AudioClipType, AudioTransitionType, VolumeKeyframe } from '../../types/editor';
import { 
  Mic, 
  Sparkles, 
  SlidersHorizontal,
  Headphones,
  Music,
  Play,
  Pause,
  Volume2,
  MoveHorizontal,
  Settings,
  Loader2,
  Zap,
  Check,
  Trash2,
} from 'lucide-react';

const dbToPercent = (db: number) => {
  if (db <= -60) return 0;
  if (db >= 0) return 100;
  return ((db + 60) / 60) * 100;
};

const formatLoudness = (val: number) => val === -Infinity ? '-∞' : val.toFixed(1);

const formatPan = (pan: number) => {
  if (Math.abs(pan) < 0.005) return '<C>';
  return pan < 0 ? `L ${Math.round(Math.abs(pan) * 100)}` : `R ${Math.round(pan * 100)}`;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const AUDIO_TYPES: { id: AudioClipType; name: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'dialogue', name: 'Dialogue', icon: <Mic className="w-4 h-4 text-blue-400" />, desc: 'Speech, voiceover, narration' },
  { id: 'music', name: 'Music', icon: <Music className="w-4 h-4 text-emerald-400" />, desc: 'Background music, score' },
  { id: 'sfx', name: 'SFX', icon: <Sparkles className="w-4 h-4 text-amber-400" />, desc: 'Sound effects, foley' },
  { id: 'ambience', name: 'Ambience', icon: <Headphones className="w-4 h-4 text-purple-400" />, desc: 'Environmental, room tone' },
];

const AUDIO_TRANSITIONS: { id: AudioTransitionType; name: string; desc: string }[] = [
  { id: 'constant-power', name: 'Constant Power', desc: 'Smooth equal-power crossfade' },
  { id: 'constant-gain', name: 'Constant Gain', desc: 'Linear gain crossfade' },
  { id: 'exponential', name: 'Exponential Fade', desc: 'Steep exponential curve' },
];

const makeKeyframeId = () => `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/** Editable volume-automation graph used by the Clip Mixer. */
const VolumeGraph: React.FC<{
  duration: number;
  keyframes: VolumeKeyframe[];
  playheadOffset: number | null;
  onChange: (keyframes: VolumeKeyframe[]) => void;
}> = ({ duration, keyframes, playheadOffset, onChange }) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const safeDuration = Math.max(0.1, duration);
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  const pointFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const y = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    return {
      time: Math.round(x * safeDuration * 100) / 100,
      volume: Math.round((1 - y) * 200) / 100,
    };
  };

  const addKeyframe = (time: number, volume: number) => {
    const next = [...keyframes];
    if (next.length === 0) {
      // Start from a flat 100% curve so the first point edits a real line.
      next.push({ id: makeKeyframeId(), time: 0, volume: 1 });
      next.push({ id: makeKeyframeId(), time: safeDuration, volume: 1 });
    }
    next.push({
      id: makeKeyframeId(),
      time: Math.round(clamp(time, 0, safeDuration) * 100) / 100,
      volume: Math.round(clamp(volume, 0, 2) * 100) / 100,
    });
    next.sort((a, b) => a.time - b.time);
    onChange(next);
  };

  const updateDraggedKeyframe = (time: number, volume: number) => {
    if (!draggingId) return;
    const next = keyframes.map(kf => kf.id === draggingId
      ? {
          ...kf,
          time: Math.round(clamp(time, 0, safeDuration) * 100) / 100,
          volume: Math.round(clamp(volume, 0, 2) * 100) / 100,
        }
      : kf);
    next.sort((a, b) => a.time - b.time);
    onChange(next);
  };

  const linePoints = sorted.length > 0
    ? sorted
    : [{ id: 'flat-start', time: 0, volume: 1 }, { id: 'flat-end', time: safeDuration, volume: 1 }];
  const polyline = linePoints
    .map(kf => `${(kf.time / safeDuration) * 100},${40 - (kf.volume / 2) * 40}`)
    .join(' ');
  const playX = playheadOffset === null
    ? null
    : clamp(playheadOffset / safeDuration, 0, 1) * 100;

  return (
    <div className="space-y-1">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="w-full h-28 bg-[#141414] border border-[#333] rounded cursor-crosshair touch-none select-none"
        onPointerDown={e => {
          if (e.button !== 0) return;
          const target = e.target as SVGElement;
          const keyframeId = target.getAttribute('data-kf-id');
          if (keyframeId) {
            setDraggingId(keyframeId);
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
          } else {
            const { time, volume } = pointFromEvent(e);
            addKeyframe(time, volume);
          }
        }}
        onPointerMove={e => {
          if (!draggingId) return;
          const { time, volume } = pointFromEvent(e);
          updateDraggedKeyframe(time, volume);
        }}
        onPointerUp={e => {
          if (!draggingId) return;
          setDraggingId(null);
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
        }}
        onPointerCancel={() => setDraggingId(null)}
      >
        {[10, 20, 30].map(y => (
          <line key={`h-${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#2a2a2a" strokeWidth="0.3" />
        ))}
        {[25, 50, 75].map(x => (
          <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="40" stroke="#242424" strokeWidth="0.3" />
        ))}
        <polyline
          points={polyline}
          fill="none"
          stroke="#34d399"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {sorted.map(kf => (
          <circle
            key={kf.id}
            data-kf-id={kf.id}
            cx={(kf.time / safeDuration) * 100}
            cy={40 - (kf.volume / 2) * 40}
            r="2.2"
            fill={draggingId === kf.id ? '#fbbf24' : '#34d399'}
            stroke="#0a0a0a"
            strokeWidth="0.5"
            className="cursor-grab"
            onContextMenu={e => {
              e.preventDefault();
              onChange(keyframes.filter(k => k.id !== kf.id));
            }}
          >
            <title>{`${kf.time.toFixed(2)}s · ${Math.round(kf.volume * 100)}% (right-click to remove)`}</title>
          </circle>
        ))}
        {playX !== null && (
          <line
            x1={playX} x2={playX} y1="0" y2="40"
            stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="1.5 1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-gray-500">
        <span>0s</span>
        <span>Click to add · drag points · right-click to remove</span>
        <span>{safeDuration.toFixed(2)}s</span>
      </div>
    </div>
  );
};

export const AudioMixerPanel: React.FC = () => {
  const { 
    project, 
    toggleTrackMute, 
    toggleTrackSolo, 
    setTrackVolume, 
    setTrackPan,
    toggleTrackLock,
    isPlaying,
    startPlayback,
    stopPlayback,
    audioInitialized,
    initAudio,
    loudness,
    activeInstances,
    selectedClipId,
    updateClipProperties,
    addClipEffect,
    removeClipEffect,
    updateClipEffectValue,
    playhead,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'mixer' | 'clip' | 'essential'>('mixer');
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing'>('stopped');
  const [showVolumeGraph, setShowVolumeGraph] = useState(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [transitionDuration, setTransitionDuration] = useState(1);
  const noticeTimerRef = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setAudioNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setAudioNotice(null), 4000);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const audioTracks = project.tracks.filter(t => t.type === 'audio');
  const selectedClip = project.clips.find(c => c.id === selectedClipId);

  // --- AI Audio Clean: real effect-backed cleanup for the selected clip ---
  const cleanTargetClip = selectedClip;
  const denoiseFx = cleanTargetClip?.appliedEffects?.find(e => e.type === 'highPass' && e.category === 'audio');
  const clarityFx = cleanTargetClip?.appliedEffects?.find(e => e.type === 'eq' && e.category === 'audio');
  const loudnessFx = cleanTargetClip?.appliedEffects?.find(e => e.type === 'loudnessNorm' && e.category === 'audio');

  const handleDenoise = (value: number) => {
    if (!cleanTargetClip) return;
    if (denoiseFx) {
      updateClipEffectValue(cleanTargetClip.id, denoiseFx.id, value);
    } else {
      addClipEffect(cleanTargetClip.id, { type: 'highPass', name: 'DeNoise (Low Cut)', category: 'audio', enabled: true, value });
      notify('DeNoise enabled');
    }
  };

  const toggleDenoise = () => {
    if (!cleanTargetClip) return;
    if (denoiseFx) {
      removeClipEffect(cleanTargetClip.id, denoiseFx.id);
      notify('DeNoise disabled');
    } else {
      handleDenoise(80);
    }
  };

  const handleClarity = (on: boolean) => {
    if (!cleanTargetClip) return;
    if (!on) {
      if (clarityFx) removeClipEffect(cleanTargetClip.id, clarityFx.id);
      notify('Voice clarity disabled');
    } else if (!clarityFx) {
      addClipEffect(cleanTargetClip.id, { type: 'eq', name: 'Voice Clarity (EQ)', category: 'audio', enabled: true, value: 70 });
      notify('Voice clarity enabled');
    }
  };

  const handleLoudnessNorm = () => {
    if (!cleanTargetClip) return;
    if (loudnessFx) {
      removeClipEffect(cleanTargetClip.id, loudnessFx.id);
      notify('Loudness normalization disabled');
    } else {
      addClipEffect(cleanTargetClip.id, { type: 'loudnessNorm', name: 'Loudness Norm (-16 LUFS)', category: 'audio', enabled: true, value: 50 });
      notify('Loudness normalization enabled');
    }
  };

  const handleAudioType = (type: AudioClipType) => {
    if (!selectedClip) return;
    const name = AUDIO_TYPES.find(t => t.id === type)?.name || type;
    updateClipProperties(selectedClip.id, { audioType: type });
    notify(`Clip tagged as ${name}`);
  };

  const applyAudioTypePreset = () => {
    if (!selectedClip?.audioType) return;
    const type = selectedClip.audioType;

    const ensureEffect = (effectType: 'highPass' | 'eq' | 'compressor' | 'loudnessNorm', name: string, value: number) => {
      const existing = selectedClip.appliedEffects?.find(e => e.type === effectType && e.category === 'audio');
      if (existing) {
        updateClipEffectValue(selectedClip.id, existing.id, value);
      } else {
        addClipEffect(selectedClip.id, { type: effectType, name, category: 'audio', enabled: true, value });
      }
    };

    if (type === 'dialogue') {
      ensureEffect('highPass', 'DeNoise (Low Cut)', 80);
      ensureEffect('eq', 'Voice Clarity (EQ)', 70);
      ensureEffect('compressor', 'Dialogue Leveler', 55);
      ensureEffect('loudnessNorm', 'Loudness Norm (-16 LUFS)', 50);
    } else if (type === 'music') {
      ensureEffect('loudnessNorm', 'Loudness Norm (-16 LUFS)', 50);
    } else if (type === 'ambience') {
      ensureEffect('highPass', 'DeNoise (Low Cut)', 60);
    } else {
      ensureEffect('loudnessNorm', 'Loudness Norm (-16 LUFS)', 50);
    }
    notify(`${AUDIO_TYPES.find(t => t.id === type)?.name} preset applied to ${selectedClip.name}`);
  };

  const handleApplyAudioTransition = (type: AudioTransitionType) => {
    if (!selectedClip) return;
    const duration = clamp(transitionDuration, 0.05, Math.max(0.1, selectedClip.duration / 2));
    updateClipProperties(selectedClip.id, {
      audioTransition: type,
      fadeIn: duration,
      fadeOut: duration,
    });
    const name = AUDIO_TRANSITIONS.find(t => t.id === type)?.name || type;
    notify(`${name} fades applied (${duration.toFixed(1)}s each end)`);
  };

  const handleRemoveAudioFades = () => {
    if (!selectedClip) return;
    updateClipProperties(selectedClip.id, { fadeIn: 0, fadeOut: 0, audioTransition: undefined });
    notify('Audio fades removed');
  };

  const handleVolumeKeyframesChange = (keyframes: VolumeKeyframe[]) => {
    if (!selectedClip) return;
    updateClipProperties(selectedClip.id, { volumeKeyframes: keyframes });
  };

  const playheadInsideClip = selectedClip &&
    playhead >= selectedClip.startTime &&
    playhead <= selectedClip.startTime + selectedClip.duration
      ? playhead - selectedClip.startTime
      : null;

  useEffect(() => {
    if (isPlaying && playbackState === 'stopped') {
      setPlaybackState('playing');
    } else if (!isPlaying && playbackState === 'playing') {
      setPlaybackState('stopped');
    }
  }, [isPlaying, playbackState]);

  const handlePlayToggle = useCallback(() => {
    if (playbackState === 'playing') {
      stopPlayback();
      setPlaybackState('stopped');
    } else {
      if (!audioInitialized) {
        initAudio().then(() => startPlayback());
      } else {
        startPlayback();
      }
      setPlaybackState('playing');
    }
  }, [playbackState, audioInitialized, initAudio, startPlayback, stopPlayback]);

  // Meter values from loudness state
  const meterLeft = useCallback(() => {
    // Approximate left channel from momentary LUFS
    const db = loudness.momentaryLUFS;
    return dbToPercent(db);
  }, [loudness.momentaryLUFS]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#2d2d2d] select-none text-xs text-gray-200 overflow-hidden">
      {/* Header with Switcher Tabs & Playback Control */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#252525] border-b border-[#2d2d2d]">
        <div className="flex items-center space-x-1 h-full">
          <button
            onClick={() => setActiveTab('mixer')}
            className={`h-full px-3 flex items-center font-medium border-b-2 transition ${
              activeTab === 'mixer'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            Track Mixer
          </button>
          <button
            onClick={() => setActiveTab('clip')}
            className={`h-full px-3 flex items-center font-medium border-b-2 transition ${
              activeTab === 'clip'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <MoveHorizontal className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Clip Mixer
          </button>
          <button
            onClick={() => setActiveTab('essential')}
            className={`h-full px-3 flex items-center font-medium border-b-2 transition ${
              activeTab === 'essential'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
            Essential Sound
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePlayToggle}
            className={`px-3 py-1.5 rounded transition flex items-center space-x-1 ${
              playbackState === 'playing'
                ? 'bg-[#1473e6] text-white shadow'
                : 'bg-[#181818] border border-[#333] text-gray-400 hover:text-white hover:bg-[#282828]'
            }`}
          >
            {playbackState === 'playing' ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
            <span className="text-[10px] font-medium">
              {playbackState === 'playing' ? 'Stop' : 'Play'}
            </span>
          </button>
          {!audioInitialized && (
            <button
              onClick={initAudio}
              className="p-1 text-[10px] text-gray-500 hover:text-white"
              title="Initialize Audio Engine"
            >
              <Loader2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {audioNotice && (
          <div className="mb-2 px-2 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] flex items-center space-x-1.5">
            <Check className="w-3 h-3 shrink-0" />
            <span className="truncate">{audioNotice}</span>
          </div>
        )}
        {activeTab === 'mixer' ? (
          /* Multi-Channel Audio Track Mixer Console */
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">Track Mixer</span>
              <span className="text-[10px] text-gray-500">{audioTracks.length} audio tracks</span>
            </div>
            <div className="flex space-x-3 min-h-[300px]">
              {audioTracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="flex-1 bg-[#222] border border-[#333] rounded-md p-2 flex flex-col items-center justify-between text-xs shadow-md"
                >
                  {/* Track Name Header */}
                  <div className="w-full text-center pb-1.5 border-b border-[#2d2d2d]">
                    <span className="font-bold text-white font-mono text-sm">{track.name}</span>
                    <div className="text-[9px] text-gray-500 uppercase mt-0.5">Track {idx + 1}</div>
                  </div>

                  {/* Pan Potentiometer */}
                  <div className="my-2 flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 mb-0.5">Pan</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-[9px] text-gray-500 font-bold">L</span>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={track.pan || 0}
                        onChange={e => setTrackPan(track.id, parseFloat(e.target.value))}
                        className="w-14 accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
                      />
                      <span className="text-[9px] text-gray-500 font-bold">R</span>
                    </div>
                    <span className="font-mono text-[9px] text-gray-400 mt-0.5">
                      {(track.pan || 0) === 0 ? '<C>' : (track.pan || 0) < 0 ? `L ${Math.abs(Math.round((track.pan || 0) * 100))}` : `R ${Math.round((track.pan || 0) * 100)}`}
                    </span>
                  </div>

                  {/* Mute, Solo, Lock */}
                  <div className="flex space-x-1 mb-2">
                    <button
                      onClick={() => toggleTrackMute(track.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                        track.muted
                          ? 'bg-red-600 text-white border-red-500'
                          : 'bg-[#181818] border-[#383838] text-gray-400 hover:text-white'
                      }`}
                    >
                      M
                    </button>
                    <button
                      onClick={() => toggleTrackSolo(track.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                        track.solo
                          ? 'bg-yellow-500 text-black border-yellow-400'
                          : 'bg-[#181818] border-[#383838] text-gray-400 hover:text-white'
                      }`}
                    >
                      S
                    </button>
                    <button
                      onClick={() => toggleTrackLock(track.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                        track.locked ? 'text-amber-400' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      L
                    </button>
                  </div>

                  {/* Vertical Fader & Meter Column */}
                  <div className="flex-1 w-full flex items-center justify-center space-x-2 my-2 py-2 bg-[#181818] rounded border border-[#2a2a2a]">
                    <div className="relative flex flex-col items-center h-44">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.02"
                        value={track.volume}
                        onChange={e => setTrackVolume(track.id, parseFloat(e.target.value))}
                        className="h-40 accent-emerald-500 cursor-pointer"
                        style={{
                          writingMode: 'vertical-lr',
                          direction: 'rtl'
                        }}
                      />
                    </div>

                    {/* Real-time Meter Bar from Web Audio API */}
                    <div className="w-2 h-40 bg-[#121212] rounded-xs border border-[#222] relative overflow-hidden flex flex-col justify-end">
                      <div
                        className="w-full transition-all duration-75"
                        style={{
                          height: `${meterLeft()}%`,
                          background: 'linear-gradient(to top, #2ecc71 0%, #2ecc71 70%, #f1c40f 85%, #e74c3c 100%)'
                        }}
                      />
                      {/* Peak hold line */}
                      <div className="absolute left-0 right-0 h-0.5 bg-white z-10 pointer-events-none"
                        style={{ bottom: `${Math.min(100, Math.max(0, meterLeft() + 5))}%` }} />
                    </div>

                    {/* Volume Readout */}
                    <div className="font-mono text-[10px] text-emerald-400 mt-1">
                      {track.volume === 0 ? '-∞ dB' : `${(20 * Math.log10(track.volume)).toFixed(1)} dB`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Master Bus */}
            <div className="mt-3 bg-[#2a2a2a] border border-[#333] rounded-md p-2 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold text-white font-mono">Master Bus</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-emerald-400">
                  {formatLoudness(loudness.integratedLUFS)} LUFS
                </span>
                <span className="text-[9px] text-gray-500">Integrated</span>
              </div>
            </div>
          </div>
        ) : activeTab === 'clip' ? (
          /* Per-Clip Audio Mixer */
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-white">Clip Mixer</span>
              <span className="text-[10px] text-gray-500">Per-clip volume, pan, and keyframes</span>
            </div>

            {!selectedClip ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500 space-y-3 border-2 border-dashed border-[#333] rounded-lg p-6">
                <MoveHorizontal className="w-8 h-8 opacity-30" />
                <span className="font-medium text-gray-300">No Clip Selected</span>
                <p className="text-[11px] text-gray-500">Select an audio or video clip on the timeline to adjust its audio properties.</p>
              </div>
            ) : (
              <>
                <div className="bg-[#242424] border border-[#333] rounded p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white truncate">{selectedClip.name || 'Clip'}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {selectedClip.type === 'audio' ? 'AUDIO' : 'VIDEO'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-400">Clip Volume</span>
                        <span className="font-mono text-emerald-400">
                          {selectedClip.volume === 0 ? '-∞ dB' : `${(20 * Math.log10(selectedClip.volume || 1)).toFixed(1)} dB`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        value={selectedClip.volume || 1}
                        onChange={e => {
                          const vol = parseFloat(e.target.value);
                          updateClipProperties(selectedClip.id, { volume: vol });
                        }}
                        className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-400">Clip Pan</span>
                        <span className="font-mono text-blue-400">
                          {formatPan(selectedClip.pan || 0)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={selectedClip.pan || 0}
                        onChange={e => updateClipProperties(selectedClip.id, { pan: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500 h-1 bg-[#141414] rounded cursor-pointer"
                      />
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[9px] text-gray-500">L</span>
                        <button
                          onClick={() => updateClipProperties(selectedClip.id, { pan: 0 })}
                          className="text-[9px] text-gray-500 hover:text-white"
                        >
                          Reset Center
                        </button>
                        <span className="text-[9px] text-gray-500">R</span>
                      </div>
                    </div>

                    {/* Volume keyframe graph */}
                    <div className="pt-2 border-t border-[#333] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-gray-400">Audio Keyframes</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181818] border border-[#333] text-gray-400 font-mono">
                            {selectedClip.volumeKeyframes?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => setShowVolumeGraph(v => !v)}
                            className={`px-2 py-1 rounded text-[10px] transition flex items-center space-x-1 ${
                              showVolumeGraph
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#1473e6]/30 text-blue-400 hover:bg-blue-600/50'
                            }`}
                          >
                            <Settings className="w-3 h-3" />
                            <span>{showVolumeGraph ? 'Hide Graph' : 'Edit Volume Graph'}</span>
                          </button>
                          {(selectedClip.volumeKeyframes?.length || 0) > 0 && (
                            <button
                              onClick={() => {
                                handleVolumeKeyframesChange([]);
                                notify('Volume automation cleared');
                              }}
                              className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-[#2a2a2a]"
                              title="Clear all volume keyframes"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {showVolumeGraph ? (
                        <VolumeGraph
                          key={selectedClip.id}
                          duration={selectedClip.duration}
                          keyframes={selectedClip.volumeKeyframes || []}
                          playheadOffset={playheadInsideClip}
                          onChange={handleVolumeKeyframesChange}
                        />
                      ) : (
                        <p className="text-[9px] text-gray-500">
                          Open the graph to draw volume automation over the clip. Keyframes are applied in preview and export.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Active Audio Instances (currently playing clips) */}
                <div className="bg-[#242424] border border-[#333] rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white">Active Playback Instances</span>
                    <span className="text-[10px] text-gray-400">{activeInstances.length} active</span>
                  </div>
                  <div className="space-y-1">
                    {activeInstances.length === 0 ? (
                      <div className="text-center py-3 text-gray-500 text-[11px]">
                        No audio currently playing
                      </div>
                    ) : (
                      activeInstances.map(inst => {
                        const clip = project.clips.find(c => c.id === inst.clipId);
                        return (
                          <div key={inst.clipId} className="flex items-center justify-between px-2 py-1 bg-[#181818] rounded border border-[#2a2a2a] text-[10px]">
                            <div className="flex items-center space-x-2">
                              <Music className="w-3 h-3 text-emerald-400" />
                              <span className="text-gray-300 truncate max-w-xs">{clip?.name || inst.clipId}</span>
                            </div>
                            <span className="font-mono text-emerald-400">
                              {inst.isPlaying ? '● PLAYING' : '○ STOPPED'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Essential Sound Panel */
          <div className="space-y-4">
            {/* Audio Type Classification */}
            <div className="bg-[#242424] border border-[#333] rounded p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-white">Audio Type</span>
                <span className="text-[9px] text-gray-500 truncate max-w-[160px]">
                  {selectedClip ? selectedClip.name : 'No clip selected'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {AUDIO_TYPES.map(tag => {
                  const active = selectedClip?.audioType === tag.id;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleAudioType(tag.id)}
                      disabled={!selectedClip}
                      className={`p-2 rounded border flex items-center space-x-2 text-left transition ${
                        active
                          ? 'border-blue-500 bg-blue-500/15'
                          : 'border-[#333] bg-[#181818] hover:border-blue-500 hover:bg-[#282828]'
                      } ${!selectedClip ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {tag.icon}
                      <div className="min-w-0">
                        <span className="font-semibold text-xs text-white block">{tag.name}</span>
                        <span className="text-[9px] text-gray-500 block truncate">{tag.desc}</span>
                      </div>
                      {active && <Check className="w-3 h-3 text-blue-400 ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {selectedClip ? (
                <div className="mt-3 pt-3 border-t border-[#333] flex items-center justify-between gap-2">
                  <span className="text-[9px] text-gray-500 min-w-0">
                    {selectedClip.audioType
                      ? `Tagged ${AUDIO_TYPES.find(t => t.id === selectedClip.audioType)?.name}. Apply its recommended cleanup preset.`
                      : 'Choose a type to enable its recommended cleanup preset.'}
                  </span>
                  <button
                    onClick={applyAudioTypePreset}
                    disabled={!selectedClip.audioType}
                    className={`px-2 py-1 rounded text-[9px] font-bold border whitespace-nowrap transition ${
                      selectedClip.audioType
                        ? 'bg-blue-600 border-blue-400 text-white hover:bg-blue-500'
                        : 'bg-[#181818] border-[#333] text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    Apply Preset
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[9px] text-gray-500">Select a clip on the timeline to tag its audio type.</p>
              )}
            </div>

            {/* Repair & Cleanup — real clip-level audio cleanup */}
            <div className="bg-[#242424] border border-[#333] rounded p-3 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-[#2d2d2d]">
                <span className="font-semibold text-white">AI Audio Clean</span>
                <span className="text-[9px] text-gray-500">
                  {cleanTargetClip ? cleanTargetClip.name.slice(0, 24) : 'no clip selected'}
                </span>
              </div>

              {!cleanTargetClip ? (
                <p className="text-[10px] text-gray-500">Select a clip on the timeline to clean up its audio. Changes play in the preview and are rendered into the exported video.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-gray-400">Reduce Background Noise</span>
                      <span className="font-mono text-emerald-400">{denoiseFx ? `${Math.round(denoiseFx.value)}%` : 'off'}</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="180"
                      step="5"
                      value={denoiseFx ? denoiseFx.value : 80}
                      onChange={e => handleDenoise(parseFloat(e.target.value))}
                      className="w-full h-1 bg-[#141414] rounded cursor-pointer accent-emerald-500"
                    />
                    <div className="flex items-center space-x-2 mt-1.5">
                      <button
                        onClick={toggleDenoise}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold border transition ${
                          denoiseFx ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-[#181818] border-[#333] text-gray-300 hover:bg-[#282828]'
                        }`}
                      >
                        {denoiseFx ? '✓ DeNoise ON' : 'Enable DeNoise'}
                      </button>
                      <span className="text-[9px] text-gray-500">High-pass rumble filter (moving the slider enables it)</span>
                    </div>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={!!clarityFx}
                      onChange={() => handleClarity(!clarityFx)}
                      className="accent-blue-500 rounded"
                    />
                    <span className="text-xs text-gray-200 font-medium">Enhance Voice Clarity (Broadcast EQ)</span>
                  </label>

                  <button
                    onClick={handleLoudnessNorm}
                    className={`w-full py-1.5 rounded text-[10px] font-bold border transition ${
                      loudnessFx ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-[#181818] border-[#333] text-gray-300 hover:bg-[#282828]'
                    }`}
                  >
                    {loudnessFx ? '✓ Loudness Normalized (-16 LUFS)' : 'Normalize Loudness (YouTube / Spotify)'}
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-gray-400">Fade In</span>
                        <span className="font-mono text-emerald-400">{(cleanTargetClip.fadeIn || 0).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={cleanTargetClip.fadeIn || 0}
                        onChange={e => updateClipProperties(cleanTargetClip!.id, { fadeIn: Math.max(0, Math.min(5, parseFloat(e.target.value))) })}
                        className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-gray-400">Fade Out</span>
                        <span className="font-mono text-emerald-400">{(cleanTargetClip.fadeOut || 0).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={cleanTargetClip.fadeOut || 0}
                        onChange={e => updateClipProperties(cleanTargetClip!.id, { fadeOut: Math.max(0, Math.min(5, parseFloat(e.target.value))) })}
                        className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <p className="text-[9px] text-gray-500">
                    💡 Tip: Fades use the curve selected under Audio Transitions and are audible in both preview and
                    export. Normalize Loudness evens out dialogue and music levels.
                  </p>
                </div>
              )}
            </div>

            {/* Loudness Metering */}
            <div className="bg-[#242424] border border-[#333] rounded p-3 space-y-3">
              <span className="font-semibold text-white block mb-3">Loudness Metering (EBU R128)</span>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Integrated LUFS</span>
                  <span className="font-mono text-emerald-400">{formatLoudness(loudness.integratedLUFS)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">True Peak</span>
                  <span className="font-mono text-emerald-400">{formatLoudness(loudness.truePeak)} dBTP</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">LRA</span>
                  <span className="font-mono text-emerald-400">{loudness.lra.toFixed(1)} LU</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Momentary</span>
                  <span className="font-mono text-emerald-400">{formatLoudness(loudness.momentaryLUFS)}</span>
                </div>
                <div className="h-1 bg-[#141414] rounded overflow-hidden border border-[#333]">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-100"
                    style={{ width: `${Math.min(100, Math.max(0, (loudness.integratedLUFS + 60) / 60 * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">
                  Target: -23 LUFS (EBU R128) · Updated: {new Date(loudness.updatedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Audio Transitions */}
            <div className="bg-[#242424] border border-[#333] rounded p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Audio Transitions</span>
                <label className="flex items-center space-x-1 text-[9px] text-gray-400">
                  <span>Duration</span>
                  <input
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={transitionDuration}
                    onChange={e => setTransitionDuration(clamp(parseFloat(e.target.value) || 0.1, 0.1, 5))}
                    className="w-12 bg-[#181818] border border-[#333] rounded px-1 py-0.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span>s</span>
                </label>
              </div>
              <p className="text-[9px] text-gray-500">
                {selectedClip
                  ? `Applies to both ends of “${selectedClip.name}”.`
                  : 'Select a clip on the timeline to apply a fade.'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {AUDIO_TRANSITIONS.map(transition => {
                  const active = !!selectedClip &&
                    selectedClip.audioTransition === transition.id &&
                    ((selectedClip.fadeIn || 0) > 0 || (selectedClip.fadeOut || 0) > 0);
                  return (
                    <button
                      key={transition.id}
                      onClick={() => handleApplyAudioTransition(transition.id)}
                      disabled={!selectedClip}
                      className={`p-2 rounded border transition flex flex-col items-center text-left ${
                        active
                          ? 'border-blue-500 bg-blue-500/15'
                          : 'border-[#333] bg-[#181818] hover:border-blue-500'
                      } ${!selectedClip ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {active
                        ? <Check className="w-3.5 h-3.5 text-blue-400 mb-1" />
                        : <Zap className="w-3.5 h-3.5 text-blue-400 mb-1" />}
                      <span className="text-[10px] font-medium text-white text-center">{transition.name}</span>
                      <span className="text-[9px] text-gray-500 mt-0.5 text-center">{transition.desc}</span>
                    </button>
                  );
                })}
              </div>
              {selectedClip && ((selectedClip.fadeIn || 0) > 0 || (selectedClip.fadeOut || 0) > 0) && (
                <button
                  onClick={handleRemoveAudioFades}
                  className="w-full py-1 rounded border border-[#333] bg-[#181818] text-[9px] text-gray-400 hover:text-red-400 hover:border-red-500/50 transition flex items-center justify-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove Audio Fades ({(selectedClip.fadeIn || 0).toFixed(1)}s in / {(selectedClip.fadeOut || 0).toFixed(1)}s out)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
