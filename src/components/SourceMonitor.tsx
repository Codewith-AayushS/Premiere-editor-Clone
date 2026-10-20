import React, { useState, useRef, useEffect } from 'react';
import { useEditor } from '../context/EditorContext';
import { EffectControls } from './EffectControls';
import { formatTimecode, formatDuration } from '../utils/timecode';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Sliders, 
  Film, 
  ArrowDownToLine
} from 'lucide-react';

export const SourceMonitor: React.FC = () => {
  const { 
    sourceAsset, 
    sourceInPoint, 
    setSourceInPoint, 
    sourceOutPoint, 
    setSourceOutPoint,
    addClipToTimeline,
    playhead
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'source' | 'effects'>('source');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const duration = sourceAsset ? sourceAsset.duration : 10;

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    if (sourceAsset) {
      setSourceInPoint(0);
      setSourceOutPoint(Math.min(5, sourceAsset.duration));
    }
  }, [sourceAsset, setSourceInPoint, setSourceOutPoint]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const markIn = () => {
    setSourceInPoint(currentTime);
    if (sourceOutPoint <= currentTime) {
      setSourceOutPoint(Math.min(duration, currentTime + 3));
    }
  };

  const markOut = () => {
    if (currentTime > sourceInPoint) {
      setSourceOutPoint(currentTime);
    }
  };

  const insertToTimeline = () => {
    if (!sourceAsset) return;
    const clipDur = Math.max(0.2, sourceOutPoint - sourceInPoint);
    const targetTrack = sourceAsset.type === 'audio' ? 'a1' : 'v1';
    addClipToTimeline(sourceAsset, targetTrack, playhead, clipDur);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-[#2d2d2d] overflow-hidden select-none">
      {/* Tab Header Bar */}
      <div className="flex items-center justify-between px-2 h-7 bg-[#252525] border-b border-[#2d2d2d] text-xs">
        <div className="flex items-center space-x-1 h-full">
          <button
            onClick={() => setActiveTab('source')}
            className={`h-full px-3 flex items-center font-medium border-b-2 transition ${
              activeTab === 'source'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Film className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            Source: {sourceAsset ? sourceAsset.name.slice(0, 18) : '(No Clip)'}
          </button>
          <button
            onClick={() => setActiveTab('effects')}
            className={`h-full px-3 flex items-center font-medium border-b-2 transition ${
              activeTab === 'effects'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
            Effect Controls
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'effects' ? (
          <EffectControls />
        ) : (
          <div className="flex flex-col h-full bg-[#141414]">
            {/* Source Video Preview Screen */}
            <div className="flex-1 flex items-center justify-center relative bg-black overflow-hidden">
              {sourceAsset ? (
                sourceAsset.type === 'image' ? (
                  <img
                    src={sourceAsset.url}
                    alt={sourceAsset.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : sourceAsset.type === 'video' ? (
                  <video
                    ref={videoRef}
                    src={sourceAsset.url}
                    className="max-h-full max-w-full object-contain"
                    onTimeUpdate={() => {
                      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                    }}
                    onEnded={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 space-y-2">
                    <div className="w-16 h-16 rounded-full bg-[#252525] flex items-center justify-center text-emerald-400">
                      <Film className="w-8 h-8" />
                    </div>
                    <span className="font-medium text-white">{sourceAsset.name}</span>
                    <span className="text-[11px] text-gray-500">Audio Track ({formatDuration(sourceAsset.duration)})</span>
                  </div>
                )
              ) : (
                <div className="text-gray-600 text-xs text-center p-4">
                  <Film className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Double-click a clip in the Project Bin to load it into Source Monitor</p>
                </div>
              )}

              {/* Timecode overlay (top-left) */}
              {sourceAsset && (
                <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[11px] font-mono text-cyan-400 border border-black/50">
                  {formatTimecode(currentTime, 30)}
                </div>
              )}

              {/* In/Out duration badge (top-right) */}
              {sourceAsset && (
                <div className="absolute top-2 right-2 bg-black/70 px-2 py-0.5 rounded text-[11px] font-mono text-gray-300 border border-black/50">
                  Range: {formatDuration(Math.max(0, sourceOutPoint - sourceInPoint))}
                </div>
              )}
            </div>

            {/* Scrubbing scrubber line */}
            {sourceAsset && (
              <div className="px-3 pt-2 bg-[#1e1e1e]">
                <div className="relative w-full h-2 bg-[#2a2a2a] rounded cursor-pointer group">
                  {/* In/Out range highlight */}
                  <div
                    className="absolute top-0 bottom-0 bg-blue-600/40 border-l border-r border-blue-400"
                    style={{
                      left: `${(sourceInPoint / duration) * 100}%`,
                      width: `${((sourceOutPoint - sourceInPoint) / duration) * 100}%`
                    }}
                  />
                  {/* Current scrub indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-yellow-400"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.05"
                    value={currentTime}
                    onChange={e => {
                      const t = parseFloat(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Bottom Transport Controls */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#1e1e1e] border-t border-[#2a2a2a] text-xs">
              <div className="flex items-center space-x-1">
                <button
                  onClick={markIn}
                  title="Mark In (I)"
                  className="px-2 py-1 bg-[#282828] hover:bg-[#383838] border border-[#3e3e3e] rounded font-bold text-blue-400 text-[11px]"
                >
                  {'{'} Mark In
                </button>
                <button
                  onClick={markOut}
                  title="Mark Out (O)"
                  className="px-2 py-1 bg-[#282828] hover:bg-[#383838] border border-[#3e3e3e] rounded font-bold text-blue-400 text-[11px]"
                >
                  {'}'} Mark Out
                </button>
              </div>

              {/* Central playback buttons */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => {
                    const next = Math.max(0, currentTime - 1);
                    setCurrentTime(next);
                    if (videoRef.current) videoRef.current.currentTime = next;
                  }}
                  className="p-1.5 hover:bg-[#2e2e2e] rounded text-gray-300"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={togglePlay}
                  className="p-1.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white shadow"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                </button>
                <button
                  onClick={() => {
                    const next = Math.min(duration, currentTime + 1);
                    setCurrentTime(next);
                    if (videoRef.current) videoRef.current.currentTime = next;
                  }}
                  className="p-1.5 hover:bg-[#2e2e2e] rounded text-gray-300"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Insert to Timeline button */}
              <button
                onClick={insertToTimeline}
                disabled={!sourceAsset}
                title="Insert clip to timeline at playhead (,)"
                className="flex items-center space-x-1 px-2.5 py-1 bg-[#2b2b2b] hover:bg-[#353535] border border-[#444] rounded text-yellow-300 font-medium disabled:opacity-30 transition"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span className="text-[11px]">Insert</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
