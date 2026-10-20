import React from 'react';
import { useEditor } from '../context/EditorContext';
import { Sliders, Volume2, Move, RotateCw, Eye, Gauge, Wand, Trash2 } from 'lucide-react';

export const EffectControls: React.FC = () => {
  const { 
    project, 
    selectedClipId, 
    updateClipProperties,
    timeRemappings,
    addTimeRemapping,
    updateTimeRemapping,
    removeTimeRemapping: _removeTimeRemapping,
    addSpeedKeyframe,
    addClipEffect,
    toggleClipEffect,
    removeClipEffect,
    updateClipEffectValue,
  } = useEditor();
  const selectedClip = project.clips.find(c => c.id === selectedClipId);
  const clipRemapping = selectedClip ? timeRemappings.find(r => r.clipId === selectedClip.id) : undefined;

  if (!selectedClip) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs p-6 text-center">
        <Sliders className="w-8 h-8 mb-2 opacity-30" />
        <p className="font-medium text-gray-400">No Clip Selected</p>
        <p className="text-[11px] mt-1">Select a clip on the timeline to inspect and modify Motion, Opacity, and Audio effects.</p>
      </div>
    );
  }

  const handleTransformChange = (key: 'x' | 'y' | 'scale' | 'rotation', value: number) => {
    updateClipProperties(selectedClip.id, {
      transform: {
        ...selectedClip.transform,
        [key]: value
      }
    });
  };

  const handleOpacityChange = (val: number) => {
    updateClipProperties(selectedClip.id, {
      opacity: Math.max(0, Math.min(1, val))
    });
  };

  const handleVolumeChange = (vol: number) => {
    updateClipProperties(selectedClip.id, {
      volume: Math.max(0, Math.min(2.0, vol))
    });
  };

  const handleSpeedChange = (speed: number) => {
    updateClipProperties(selectedClip.id, {
      speed: Math.max(0.25, Math.min(4.0, speed))
    });
  };

  // ---- Chroma Key (AI Background Removal) helpers ----
  const chromaKeyFx = selectedClip.appliedEffects?.find(e => e.type === 'chromaKey');

  const handleToggleChromaKey = () => {
    if (chromaKeyFx) {
      removeClipEffect(selectedClip.id, chromaKeyFx.id);
    } else {
      addClipEffect(selectedClip.id, {
        type: 'chromaKey',
        name: 'Chroma Key (Green Screen)',
        category: 'video',
        enabled: true,
        value: 30,
        params: { keyColor: 'green' },
      });
    }
  };

  // ---- Fade helpers (audio fades, applied in exported video) ----
  const updateFades = (key: 'fadeIn' | 'fadeOut', value: number) => {
    const v = Math.max(0, Math.min(5, value));
    updateClipProperties(selectedClip.id, key === 'fadeIn' ? { fadeIn: v } : { fadeOut: v });
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-xs text-gray-300 overflow-y-auto p-3 space-y-4">
      {/* Header with clip metadata */}
      <div className="pb-2 border-b border-[#2d2d2d] flex items-center justify-between">
        <div>
          <span className="font-semibold text-white text-sm">{selectedClip.name}</span>
          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold" style={{ backgroundColor: selectedClip.color + '44', color: selectedClip.color }}>
            {selectedClip.type}
          </span>
        </div>
        <span className="text-gray-400 font-mono text-[11px]">
          Duration: {selectedClip.duration.toFixed(2)}s
        </span>
      </div>

      {/* Applied Effects — inspect, adjust and remove anything */}
      {(selectedClip.appliedEffects?.length ?? 0) > 0 && (
        <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Applied Effects ({selectedClip.appliedEffects!.length})</span>
            </div>
            <button
              onClick={() => {
                for (const fx of [...selectedClip!.appliedEffects!]) {
                  removeClipEffect(selectedClip!.id, fx.id);
                }
              }}
              className="text-[9px] px-1.5 py-0.5 rounded bg-[#181818] border border-[#333] text-gray-400 hover:text-red-400 hover:border-red-500/50 transition"
              title="Remove every effect from this clip"
            >
              Remove All
            </button>
          </div>

          <div className="space-y-1.5">
            {selectedClip.appliedEffects!.map(fx => (
              <div key={fx.id} className="bg-[#1b1b1b] border border-[#333] rounded p-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-1.5 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={fx.enabled}
                      onChange={() => toggleClipEffect(selectedClip!.id, fx.id)}
                      className="accent-blue-500 rounded"
                    />
                    <span className={`truncate ${fx.enabled ? 'text-gray-100' : 'text-gray-500 line-through'}`}>
                      {fx.name}
                    </span>
                    {fx.category === 'audio' && (
                      <span className="text-[8px] bg-blue-900/40 text-blue-300 px-1 rounded uppercase shrink-0">A</span>
                    )}
                  </label>
                  <button
                    onClick={() => removeClipEffect(selectedClip!.id, fx.id)}
                    title={`Remove "${fx.name}" from this clip`}
                    className="p-1 text-gray-500 hover:text-red-400 rounded shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={fx.value}
                    onChange={e => updateClipEffectValue(selectedClip!.id, fx.id, parseFloat(e.target.value))}
                    className="flex-1 accent-amber-500 h-1 bg-[#141414] rounded cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-gray-400 w-7 text-right">{Math.round(fx.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Motion Section */}
      {(selectedClip.type === 'video' || selectedClip.type === 'image') && (
        <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-3">
          <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
            <Move className="w-3.5 h-3.5 text-blue-400" />
            <span>Video Motion</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Position X (px)</label>
              <input
                type="number"
                value={Math.round(selectedClip.transform.x)}
                onChange={e => handleTransformChange('x', parseFloat(e.target.value) || 0)}
                className="w-full bg-[#181818] border border-[#3a3a3a] rounded px-2 py-1 text-white font-mono text-xs focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Position Y (px)</label>
              <input
                type="number"
                value={Math.round(selectedClip.transform.y)}
                onChange={e => handleTransformChange('y', parseFloat(e.target.value) || 0)}
                className="w-full bg-[#181818] border border-[#3a3a3a] rounded px-2 py-1 text-white font-mono text-xs focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Scale</span>
              <span className="font-mono text-blue-400">{Math.round(selectedClip.transform.scale * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.5"
              step="0.05"
              value={selectedClip.transform.scale}
              onChange={e => handleTransformChange('scale', parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-1 bg-[#141414] rounded cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400 flex items-center"><RotateCw className="w-3 h-3 mr-1" /> Rotation</span>
              <span className="font-mono text-blue-400">{Math.round(selectedClip.transform.rotation)}°</span>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={selectedClip.transform.rotation}
              onChange={e => handleTransformChange('rotation', parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-1 bg-[#141414] rounded cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Video Opacity Section */}
      {(selectedClip.type === 'video' || selectedClip.type === 'image') && (
        <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-3">
          <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
            <Eye className="w-3.5 h-3.5 text-blue-400" />
            <span>Opacity & Blending</span>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Opacity</span>
              <span className="font-mono text-blue-400">{Math.round(selectedClip.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={selectedClip.opacity}
              onChange={e => handleOpacityChange(parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-1 bg-[#141414] rounded cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Chroma Key / AI Background Removal Section */}
      {(selectedClip.type === 'video' || selectedClip.type === 'image') && (
        <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
              <Wand className="w-3.5 h-3.5 text-lime-400" />
              <span>Chroma Key (AI Background Removal)</span>
            </div>
            <input
              type="checkbox"
              checked={!!chromaKeyFx}
              onChange={handleToggleChromaKey}
              className="accent-lime-500 rounded"
            />
          </div>

          {chromaKeyFx && (
            <div className="space-y-3">
              <p className="text-[10px] text-gray-500">Works best on footage shot against an evenly-lit green or blue screen.</p>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-400">Key Color</span>
                </div>
                <div className="flex space-x-2">
                  {(['green', 'blue'] as const).map(kc => (
                    <button
                      key={kc}
                      onClick={() => {
                        // Replace the effect's key color
                        removeClipEffect(selectedClip.id, chromaKeyFx.id);
                        addClipEffect(selectedClip.id, {
                          type: 'chromaKey',
                          name: kc === 'blue' ? 'Chroma Key (Blue Screen)' : 'Chroma Key (Green Screen)',
                          category: 'video',
                          enabled: true,
                          value: chromaKeyFx.value,
                          params: { keyColor: kc },
                        });
                      }}
                      className={`flex-1 py-1 rounded text-[10px] font-bold border transition ${
                        (chromaKeyFx.params?.keyColor as string || 'green') === kc
                          ? 'bg-lime-600 border-lime-400 text-white'
                          : 'bg-[#181818] border-[#333] text-gray-300 hover:bg-[#282828]'
                      }`}
                    >
                      {kc === 'green' ? 'GREEN SCREEN' : 'BLUE SCREEN'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-400">Tolerance (Similarity)</span>
                  <span className="font-mono text-lime-400">{Math.round(chromaKeyFx.value)}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  step="1"
                  value={chromaKeyFx.value}
                  onChange={e => updateClipEffectValue(selectedClip.id, chromaKeyFx.id, parseFloat(e.target.value))}
                  className="w-full accent-lime-500 h-1 bg-[#141414] rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio Gain Section */}
      <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-3">
        <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Audio Gain / Volume</span>
        </div>

        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-400">Level</span>
            <span className="font-mono text-emerald-400">
              {selectedClip.volume === 0 ? '-∞ dB' : `${(20 * Math.log10(selectedClip.volume)).toFixed(1)} dB`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={selectedClip.volume}
            onChange={e => handleVolumeChange(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Fade In</span>
              <span className="font-mono text-emerald-400">{(selectedClip.fadeIn || 0).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={selectedClip.fadeIn || 0}
              onChange={e => updateFades('fadeIn', parseFloat(e.target.value))}
              className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
            />
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-gray-400">Fade Out</span>
              <span className="font-mono text-emerald-400">{(selectedClip.fadeOut || 0).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={selectedClip.fadeOut || 0}
              onChange={e => updateFades('fadeOut', parseFloat(e.target.value))}
              className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Speed & Duration Section */}
      <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-3">
        <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
          <Gauge className="w-3.5 h-3.5 text-purple-400" />
          <span>Playback Speed</span>
        </div>

        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-gray-400">Speed Multiplier</span>
            <span className="font-mono text-purple-400">{selectedClip.speed}x</span>
          </div>
          <div className="flex space-x-2 mt-2">
            {[0.5, 1.0, 1.5, 2.0].map(s => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`flex-1 py-1 rounded text-[10px] font-bold border transition ${
                  selectedClip.speed === s
                    ? 'bg-purple-600 border-purple-400 text-white'
                    : 'bg-[#181818] border-[#333] text-gray-300 hover:bg-[#282828]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Time Remapping Section */}
      <div className="bg-[#242424] rounded border border-[#333333] p-3 space-y-3">
        <div className="flex items-center space-x-2 font-semibold text-gray-200 text-xs">
          <Gauge className="w-3.5 h-3.5 text-pink-400" />
          <span>Time Remapping</span>
        </div>

        <div className="flex items-center space-x-2 mb-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={clipRemapping?.enabled || false}
              onChange={() => {
                if (!selectedClipId) return;
                const current = timeRemappings.find(r => r.clipId === selectedClipId);
                if (current) {
                  updateTimeRemapping(selectedClipId, { enabled: !current.enabled });
                } else {
                  addTimeRemapping(selectedClipId, [], false);
                }
              }}
              className="accent-pink-500 rounded"
            />
            <span className="text-xs text-gray-300">Enable Time Remapping</span>
          </label>
          <span className="ml-auto text-[10px] text-gray-500">
            {clipRemapping?.reverse ? 'REVERSE' : 'FORWARD'}
          </span>
        </div>

        {clipRemapping && clipRemapping.enabled && (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-gray-400">Speed Keyframes</span>
                <span className="font-mono text-pink-400">{clipRemapping.speedKeyframes.length}</span>
              </div>
              <div className="h-32 bg-[#141414] border border-[#333] rounded overflow-hidden relative mb-2">
                {/* Speed graph visualization */}
                <div className="absolute inset-0 flex items-end justify-between gap-0.5 px-1 py-1">
                  {clipRemapping.speedKeyframes.map((kf, _i) => (
                    <div
                      key={kf.id}
                      className="w-2 bg-pink-400 rounded-t cursor-pointer hover:bg-pink-300 transition"
                      style={{
                        left: `${(kf.time / (selectedClip.duration || 10)) * 100}%`,
                        height: `${Math.max(10, Math.min(90, kf.speed * 20))}%`,
                      }}
                      title={`Speed: ${(kf.speed * 100).toFixed(0)}% at ${kf.time.toFixed(1)}s`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.1"
                  value={selectedClip.speed}
                  onChange={e => handleSpeedChange(parseFloat(e.target.value))}
                  className="flex-1 accent-pink-500 h-1 bg-[#141414] rounded cursor-pointer"
                />
                <button
                  onClick={() => {
                    if (!selectedClipId) return;
                    addSpeedKeyframe(selectedClipId, {
                      time: 0,
                      speed: selectedClip.speed,
                      interpolation: 'linear',
                    });
                  }}
                  className="px-2 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold"
                  title="Add Speed Keyframe"
                >
                  <span>+ Keyframe</span>
                </button>
              </div>
              <div className="space-y-1 text-[10px] text-gray-400">
                {clipRemapping.speedKeyframes.map((kf, _i) => (
                  <div key={kf.id} className="flex items-center justify-between p-1 bg-[#181818] rounded border border-[#2a2a2a]">
                    <span className="font-mono text-pink-400">
                      {kf.time.toFixed(1)}s
                    </span>
                    <span className="font-mono text-pink-400">
                      {(kf.speed * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={() => {
                        // Remove keyframe (placeholder)
                      }}
                      className="p-0.5 hover:text-rose-400"
                    >
                      <span className="text-[9px]">×</span>
                    </button>
                  </div>
                ))}
                {clipRemapping.speedKeyframes.length === 0 && (
                  <div className="text-center py-2 text-gray-500">
                    No speed keyframes. Click "+ Keyframe" to add.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

