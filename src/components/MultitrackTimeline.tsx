import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useEditor } from '../context/EditorContext';
import type { TimelineClip, MediaAsset } from '../types/editor';
import { formatTimecode, formatDuration, snapToGrid } from '../utils/timecode';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  ZoomIn, 
  ZoomOut, 
  Scissors,
  Trash2
} from 'lucide-react';

export const MultitrackTimeline: React.FC = () => {
  const { 
    project, 
    playhead, 
    seek, 
    zoom, 
    setZoom, 
    activeTool, 
    selectedClipId, 
    setSelectedClipId,
    selectedClipIds,
    setSelectedClipIds,
    addTrack,
    removeTrack,
    moveClip,
    trimClip,
    splitClipAt,
    splitAtPlayhead,
    deleteClip,
    toggleTrackOutput,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackLock,
    setTrackVolume,
    snappingEnabled,
    addClipToTimeline,
    markers,
    addMarker,
  } = useEditor();

  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbingPlayhead, setIsScrubbingPlayhead] = useState<boolean>(false);

  // Dragging clip states — store ORIGIN values for absolute computation
  const draggingClipRef = useRef<{
    clipId: string;
    startX: number;
    initialStartTime: number;
    initialTrackId: string;
    // Whole multi-selection snapshot: every clip moves together (time + track)
    members: { id: string; start: number; track: string }[];
  } | null>(null);

  // Trimming states — store ORIGIN values for absolute computation (recalibrated each move)
  const trimmingClipRef = useRef<{
    clipId: string;
    edge: 'start' | 'end';
    startX: number;
    initialDuration: number;
    initialStartTime: number;
    initialInPoint: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  // Track row highlighted as the drop target while dragging clips vertically
  const [dragHoverTrack, setDragHoverTrack] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId?: string; trackId?: string } | null>(null);
  // Marquee (drag-box) multi-selection on empty track lanes
  const [marqueeBox, setMarqueeBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const marqueeBoxRef = useRef(marqueeBox);
  marqueeBoxRef.current = marqueeBox;

  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0 || activeTool === 'razor') return;
    setContextMenu(null);
    setSelectedClipId(null);
    setSelectedClipIds([]);
    setMarqueeBox({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
    setIsMarqueeActive(true);
  };

  // Turn the finished marquee rectangle into a clip selection by testing
  // each rendered clip element's on-screen rect for intersection.
  const finishMarquee = useCallback(() => {
    const box = marqueeBoxRef.current;
    setMarqueeBox(null);
    setIsMarqueeActive(false);
    if (!box) return;
    const rect = {
      x: Math.min(box.x0, box.x1),
      y: Math.min(box.y0, box.y1),
      w: Math.abs(box.x1 - box.x0),
      h: Math.abs(box.y1 - box.y0),
    };
    // Tiny drag = plain click on empty space → keep the cleared selection
    if (rect.w < 4 && rect.h < 4) return;
    const container = timelineContainerRef.current;
    if (!container) return;
    const ids: string[] = [];
    container.querySelectorAll<HTMLElement>('[data-clip-id]').forEach(el => {
      const r = el.getBoundingClientRect();
      const intersects =
        r.left < rect.x + rect.w && r.right > rect.x &&
        r.top < rect.y + rect.h && r.bottom > rect.y;
      if (intersects) ids.push(el.dataset.clipId as string);
    });
    if (ids.length > 0) {
      setSelectedClipIds(ids);
      setSelectedClipId(ids[0]);
    }
  }, [setSelectedClipId, setSelectedClipIds]);

  // While a marquee drag is active, track the pointer globally
  useEffect(() => {
    if (!isMarqueeActive) return;
    const move = (e: PointerEvent) => {
      setMarqueeBox(b => (b ? { ...b, x1: e.clientX, y1: e.clientY } : null));
    };
    const up = () => finishMarquee();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [isMarqueeActive, finishMarquee]);


  // refs for latest state access in event handlers
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const snappingRef = useRef(snappingEnabled);
  snappingRef.current = snappingEnabled;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;
  const clipsRef = useRef(project.clips);
  clipsRef.current = project.clips;
  const tracksRef = useRef(project.tracks);
  tracksRef.current = project.tracks;
  const dragHoverRef = useRef<string | null>(null);

  // Global pointer handlers (attached to window when dragging/trimming)
  const handleGlobalPointerMove = useCallback((e: PointerEvent) => {
    const drag = draggingClipRef.current;
    if (drag) {
      const deltaX = e.clientX - drag.startX;
      const deltaSec = deltaX / zoomRef.current;
      let newTime = Math.max(0, drag.initialStartTime + deltaSec);

      if (snappingRef.current) {
        const memberIds = drag.members.map(m => m.id);
        const snapPoints = [0, playheadRef.current];
        clipsRef.current.forEach(c => {
          if (!memberIds.includes(c.id)) {
            snapPoints.push(c.startTime);
            snapPoints.push(c.startTime + c.duration);
          }
        });
        const { time } = snapToGrid(newTime, snapPoints, 0.2);
        newTime = time;
      }

      // Which track row is under the pointer? (mapped from the dragging lane)
      let hovered: string | null = null;
      timelineContainerRef.current?.querySelectorAll<HTMLElement>('[data-track-row]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY < r.bottom) hovered = el.dataset.trackRow as string;
      });

      // Map the hovered track into a per-clip destination (same track type only)
      const anchorMember = drag.members.find(m => m.id === drag.clipId) ?? drag.members[0];
      const anchorInitial = tracksRef.current.find(t => t.id === anchorMember.track);
      const hoverTrack = hovered ? tracksRef.current.find(t => t.id === hovered) : undefined;
      const trackShift: Record<string, string> = {};
      const canSwitch = hovered && anchorInitial && hoverTrack && hoverTrack.type === anchorInitial.type;
      if (canSwitch && hovered) {
        const anchorList = tracksRef.current.filter(t => t.type === anchorInitial.type).map(t => t.id);
        const anchorIdx = anchorList.indexOf(anchorInitial.id);
        const hoverIdx = anchorList.indexOf(hovered);
        drag.members.forEach(m => {
          const mTrack = tracksRef.current.find(t => t.id === m.track);
          // Only switch members whose type matches the anchor's (video↔video, audio↔audio)
          if (mTrack && mTrack.type === anchorInitial.type) {
            const mList = tracksRef.current.filter(t => t.type === mTrack.type).map(t => t.id);
            const mOrigIdx = mList.indexOf(m.track);
            const targetIdx = Math.max(0, Math.min(mList.length - 1, mOrigIdx + (hoverIdx - anchorIdx)));
            trackShift[m.id] = mList[targetIdx];
          }
        });
      }

      // Hover highlight on the target lane (same type only)
      const hoverState = canSwitch ? hovered : null;
      if (dragHoverRef.current !== hoverState) {
        dragHoverRef.current = hoverState;
        setDragHoverTrack(hoverState);
      }

      const dt = newTime - drag.initialStartTime;
      // Move the whole multi-selection together; members keep their relative time offsets
      drag.members.forEach(m => {
        moveClip(m.id, Math.max(0, m.start + dt), trackShift[m.id] ?? m.track);
      });
    }

    const trim = trimmingClipRef.current;
    if (trim) {
      const deltaX = e.clientX - trim.startX;
      const deltaSec = deltaX / zoomRef.current;
      const clip = clipsRef.current.find(c => c.id === trim.clipId);
      if (!clip) return;

      if (trim.edge === 'start') {
        const newStartTime = Math.max(0, trim.initialStartTime + deltaSec);
        const actualDelta = newStartTime - clip.startTime;
        if (Math.abs(actualDelta) > 0.001) {
          trimClip(trim.clipId, 'start', actualDelta);
          // Recalibrate origin to avoid drift
          trimmingClipRef.current = {
            ...trim,
            startX: e.clientX,
            initialStartTime: newStartTime,
            initialDuration: trim.initialDuration - (newStartTime - trim.initialStartTime),
            initialInPoint: trim.initialInPoint + (newStartTime - trim.initialStartTime)
          };
        }
      } else {
        const newDuration = Math.max(0.2, trim.initialDuration + deltaSec);
        const currentDelta = newDuration - clip.duration;
        if (Math.abs(currentDelta) > 0.001) {
          trimClip(trim.clipId, 'end', currentDelta);
          trimmingClipRef.current = {
            ...trim,
            startX: e.clientX,
            initialDuration: newDuration
          };
        }
      }
    }
  }, [moveClip, trimClip]);

  const handleGlobalPointerUp = useCallback(() => {
    draggingClipRef.current = null;
    trimmingClipRef.current = null;
    dragHoverRef.current = null;
    setDragHoverTrack(null);
    setIsDragging(false);
    setIsTrimming(false);
  }, []);

  useEffect(() => {
    if (!isDragging && !isTrimming) return;
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [isDragging, isTrimming, handleGlobalPointerMove, handleGlobalPointerUp]);

  // Keyboard shortcuts for timeline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete every selected clip (multi-selection) or the primary one
        const ids = selectedClipIds.length > 0
          ? selectedClipIds
          : (selectedClipId ? [selectedClipId] : []);
        if (ids.length > 0) {
          e.preventDefault();
          ids.forEach(id => deleteClip(id, e.shiftKey));
          setSelectedClipIds([]);
          setSelectedClipId(null);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        // Select all clips on the timeline
        e.preventDefault();
        setSelectedClipIds(project.clips.map(c => c.id));
        setSelectedClipId(project.clips[0]?.id ?? null);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        splitAtPlayhead();
      } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addMarker(playheadRef.current, `Marker ${markers.length + 1}`, '#f1c40f');
      } else if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, selectedClipIds, deleteClip, splitAtPlayhead, project.clips, setSelectedClipId, setSelectedClipIds]);

  // Dismiss context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    window.addEventListener('click', dismiss);
    return () => window.removeEventListener('click', dismiss);
  }, [contextMenu]);

  // Handle Playhead Scrubbing on Time Ruler
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsScrubbingPlayhead(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, (e.clientX - rect.left) / zoom));
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingPlayhead) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, (e.clientX - rect.left) / zoom));
  };

  const handleRulerPointerUp = () => setIsScrubbingPlayhead(false);

  // Drag & Drop from Project Bin
  const handleTrackDrop = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const asset: MediaAsset = JSON.parse(dataStr);
      if (!asset) return;
      const trackRect = e.currentTarget.getBoundingClientRect();
      const dropTime = Math.max(0, (e.clientX - trackRect.left) / zoom);
      addClipToTimeline(asset, trackId, dropTime);
    } catch (err) {
      console.warn('Drop failed:', err);
    }
  };

  // Clip Pointer Down (select, drag, or razor-split)
  const handleClipPointerDown = (e: React.PointerEvent, clip: TimelineClip) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (activeTool === 'razor') {
      const clipRect = e.currentTarget.getBoundingClientRect();
      splitClipAt(clip.id, clip.startTime + (e.clientX - clipRect.left) / zoom);
      return;
    }

    // Shift+click adds to / removes from the multi-selection; plain click selects one
    if (e.shiftKey) {
      const next = selectedClipIds.includes(clip.id)
        ? selectedClipIds.filter(id => id !== clip.id)
        : [...selectedClipIds, clip.id];
      setSelectedClipIds(next);
      setSelectedClipId(next[next.length - 1] ?? null);
    } else if (!selectedClipIds.includes(clip.id)) {
      // Clicking an unselected clip starts a single-clip drag
      setSelectedClipId(clip.id);
      setSelectedClipIds([clip.id]);
    }
    // If the clicked clip is inside the current multi-selection, the WHOLE
    // selection drags together (like Premiere). Snapshot members to move.
    const memberIds = selectedClipIds.includes(clip.id) ? selectedClipIds : [clip.id];
    const members = memberIds
      .map(id => clipsRef.current.find(c => c.id === id))
      .filter((c): c is TimelineClip => Boolean(c))
      .map(c => ({ id: c.id, start: c.startTime, track: c.trackId }));
    draggingClipRef.current = {
      clipId: clip.id,
      startX: e.clientX,
      initialStartTime: clip.startTime,
      initialTrackId: clip.trackId,
      members,
    };
    setIsDragging(true);
  };

  // Trim handle pointer down
  const handleTrimStart = (e: React.PointerEvent, clip: TimelineClip, edge: 'start' | 'end') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    trimmingClipRef.current = {
      clipId: clip.id,
      edge,
      startX: e.clientX,
      initialDuration: clip.duration,
      initialStartTime: clip.startTime,
      initialInPoint: clip.inPoint
    };
    setIsTrimming(true);
  };

  // Right-click context menu on clip
  const handleClipContextMenu = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  };

  // Right-click on empty lane space: general timeline menu
  const handleLaneContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Right-click on a track header: track management menu
  const handleTrackContextMenu = (e: React.MouseEvent, trackId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId });
  };

  // Delete every multi-selected clip at once (falls back to the primary clip)
  const deleteAllSelected = () => {
    const ids = selectedClipIds.length > 0
      ? selectedClipIds
      : (selectedClipId ? [selectedClipId] : []);
    if (ids.length === 0) return;
    ids.forEach(id => deleteClip(id, false));
    setSelectedClipIds([]);
    setSelectedClipId(null);
  };

  // Generate ruler tick marks
  const totalSeconds = Math.ceil(project.duration);
  const secondInterval = zoom > 120 ? 1 : zoom > 50 ? 2 : 5;
  const tickMarks: number[] = [];
  for (let s = 0; s <= totalSeconds; s += secondInterval) tickMarks.push(s);

  const timelinePixelWidth = Math.max(1200, project.duration * zoom + 300);

  // Simulated waveform bars for audio clips
  const renderAudioWaveform = (clip: TimelineClip, clipWidthPx: number) => {
    const barCount = Math.max(4, Math.floor(clipWidthPx / 4));
    const seed = clip.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return (
      <div className="absolute inset-x-2 inset-y-0 flex items-center space-x-px overflow-hidden pointer-events-none opacity-50">
        {Array.from({ length: barCount }).map((_, i) => {
          const h = 15 + ((seed * (i + 1) * 17 + i * 31) % 65);
          return (
            <div
              key={i}
              className="flex-shrink-0 rounded-full"
              style={{ 
                width: '2px', 
                height: `${h}%`, 
                backgroundColor: 'rgba(255,255,255,0.85)' 
              }}
            />
          );
        })}
      </div>
    );
  };

  // Filmstrip-style thumbnail strip for video/image clips (like Premiere Pro).
  // Uses the asset's rendered thumbnail, offset by the clip's trim point so
  // the visible frames feel connected to the source media.
  const renderFilmstrip = (clip: TimelineClip, clipWidthPx: number) => {
    if (clipWidthPx < 26) return null;
    const asset = project.assets.find(a => a.id === clip.assetId);
    const thumbUrl = asset?.thumbnail || (asset?.type === 'image' ? asset.url : null);
    if (!thumbUrl) return null;
    const offsetPx = -(clip.inPoint * zoom) % 64;
    return (
      <div
        className="absolute inset-y-0 left-0 right-0 pointer-events-none overflow-hidden rounded-sm"
        style={{
          backgroundImage: `url(${thumbUrl})`,
          backgroundRepeat: 'repeat-x',
          backgroundSize: 'auto 100%',
          backgroundPosition: `${offsetPx}px center`,
          opacity: 0.45,
          filter: 'saturate(0.9)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 45%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 45%)',
        }}
      />
    );
  };

  const contextClip = contextMenu ? project.clips.find(c => c.id === contextMenu.clipId) : null;
  // Effective selection size (multi-selection array, or the primary clip alone)
  const selectedCount = selectedClipIds.length > 0 ? selectedClipIds.length : (selectedClipId ? 1 : 0);

  return (
    <div
      className="relative flex-1 flex flex-col h-full bg-[#181818] overflow-hidden select-none"
      onClick={() => setContextMenu(null)}
    >
      {/* Timeline Controls Header */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#202020] border-b border-[#2d2d2d] text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-white">Sequence Timeline</span>
          <span className="text-[11px] font-mono text-cyan-400 bg-[#141414] px-2 py-0.5 rounded border border-[#333]">
            CTI: {formatTimecode(playhead, project.fps)}
          </span>
          {activeTool === 'razor' && (
            <span className="flex items-center text-rose-400 text-[10px] font-bold bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800">
              <Scissors className="w-3 h-3 mr-1" /> RAZOR TOOL ACTIVE — Click clip to split
            </span>
          )}
          {markers.length > 0 && (
            <span className="text-[10px] text-yellow-400 font-mono">
              {markers.length} marker{markers.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-gray-600 hidden sm:block">M = add marker · Right-click clip/menu · +V/+A = add track</span>
        </div>

        {/* Zoom Slider Controls */}
        <div className="flex items-center space-x-2 text-gray-400">
          <button 
            onClick={() => setZoom(z => Math.max(20, z - 15))}
            title="Zoom Out (-)"
            className="p-1 hover:text-white hover:bg-[#2b2b2b] rounded"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          
          <input
            type="range"
            min="20"
            max="250"
            step="5"
            value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="w-24 accent-blue-500 h-1 bg-[#141414] rounded cursor-pointer"
          />

          <button 
            onClick={() => setZoom(z => Math.min(300, z + 15))}
            title="Zoom In (+)"
            className="p-1 hover:text-white hover:bg-[#2b2b2b] rounded"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[10px] text-gray-400 w-8 text-right">{Math.round(zoom)}px</span>
        </div>
      </div>

      {/* Main Multitrack Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers Column (fixed width on left) */}
        <div className="w-48 bg-[#202020] border-r border-[#2d2d2d] flex flex-col shrink-0 select-none z-10 shadow-md">
          {/* Top ruler gutter with track management buttons */}
          <div className="h-7 bg-[#252525] border-b border-[#2d2d2d] px-2 flex items-center justify-between text-[11px] text-gray-400 font-semibold">
            <div className="flex items-center space-x-1">
              <span>TRACKS</span>
              <button
                onClick={() => addTrack('video')}
                title="Add Video Track (V4, V5, ...)"
                className="px-1 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#1473e6] hover:text-white text-[9px] font-bold text-gray-300"
              >
                +V
              </button>
              <button
                onClick={() => addTrack('audio')}
                title="Add Audio Track (A4, A5, ...)"
                className="px-1 py-0.5 rounded bg-[#2d2d2d] hover:bg-[#1473e6] hover:text-white text-[9px] font-bold text-gray-300"
              >
                +A
              </button>
            </div>
            <span className="text-[9px] text-gray-500">M/S/LOCK</span>
          </div>

          {/* Video Track Headers */}
          <div className="flex flex-col">
            {project.tracks
              .filter(t => t.type === 'video')
              .map(track => (
                <div
                  key={track.id}
                  className="h-14 px-2.5 bg-[#222222] border-b border-[#2d2d2d] flex items-center justify-between text-xs"
                  onContextMenu={(e) => handleTrackContextMenu(e, track.id)}
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-300 w-6 font-mono">{track.name}</span>
                    <button
                      onClick={() => toggleTrackOutput(track.id)}
                      title="Toggle Track Output"
                      className={`p-1 rounded ${track.visible ? 'text-gray-300 hover:text-white' : 'text-gray-600'}`}
                    >
                      {track.visible ? <Eye className="w-3.5 h-3.5 text-blue-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => toggleTrackLock(track.id)}
                      title="Toggle Track Lock"
                      className={`p-1 rounded ${track.locked ? 'text-amber-400' : 'text-gray-600 hover:text-gray-300'}`}
                    >
                      {track.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">Video</span>
                </div>
              ))}
          </div>

          {/* Heavy Divider Axis between Video and Audio */}
          <div className="h-1 bg-[#1473e6] opacity-70" />

          {/* Audio Track Headers */}
          <div className="flex flex-col">
            {project.tracks
              .filter(t => t.type === 'audio')
              .map(track => (
                <div
                  key={track.id}
                  className="h-14 px-2.5 bg-[#1e1e1e] border-b border-[#2d2d2d] flex items-center justify-between text-xs"
                  onContextMenu={(e) => handleTrackContextMenu(e, track.id)}
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-gray-300 w-6 font-mono">{track.name}</span>
                    <button
                      onClick={() => toggleTrackMute(track.id)}
                      title="Mute Track"
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                        track.muted 
                          ? 'bg-red-600 text-white border-red-500' 
                          : 'bg-[#282828] text-gray-400 border-[#383838] hover:text-white'
                      }`}
                    >
                      M
                    </button>
                    <button
                      onClick={() => toggleTrackSolo(track.id)}
                      title="Solo Track"
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                        track.solo 
                          ? 'bg-yellow-500 text-black border-yellow-400' 
                          : 'bg-[#282828] text-gray-400 border-[#383838] hover:text-white'
                      }`}
                    >
                      S
                    </button>
                    <button
                      onClick={() => toggleTrackLock(track.id)}
                      title="Toggle Track Lock"
                      className={`p-1 rounded ${track.locked ? 'text-amber-400' : 'text-gray-600 hover:text-gray-300'}`}
                    >
                      {track.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Volume Slider */}
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={track.volume}
                    onChange={e => setTrackVolume(track.id, parseFloat(e.target.value))}
                    className="w-12 accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
                    title={`Volume: ${(track.volume * 100).toFixed(0)}%`}
                  />
                </div>
              ))}
          </div>
        </div>

        {/* Scrollable Timeline Area (Ruler + Tracks Canvas) */}
        <div 
          ref={timelineContainerRef}
          className="flex-1 overflow-x-auto overflow-y-auto bg-[#141414] relative"
        >
          <div ref={contentRef} style={{ width: `${timelinePixelWidth}px` }} className="relative min-h-full">
            {/* 1. Time Ruler */}
            <div
              className="h-7 bg-[#222222] border-b border-[#2d2d2d] relative cursor-pointer select-none"
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            >
              {tickMarks.map(sec => (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-[#3a3a3a] text-[10px] font-mono text-gray-400 pl-1 pt-0.5 pointer-events-none"
                  style={{ left: `${sec * zoom}px` }}
                >
                  {formatDuration(sec)}
                </div>
              ))}

              {/* Markers on ruler */}
              {markers.map(marker => (
                <div
                  key={marker.id}
                  className="absolute top-0 h-full pointer-events-none z-10 flex flex-col items-center"
                  style={{ left: `${marker.time * zoom - 4}px` }}
                  title={marker.label}
                >
                  <div
                    className="w-0 h-0"
                    style={{
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: `8px solid ${marker.color}`,
                    }}
                  />
                </div>
              ))}

              {/* Marker vertical lines through tracks */}
              {markers.map(marker => (
                <div
                  key={`mline_${marker.id}`}
                  className="absolute top-7 pointer-events-none z-20"
                  style={{
                    left: `${marker.time * zoom}px`,
                    height: '1000px',
                    width: '1px',
                    backgroundColor: marker.color,
                    opacity: 0.3
                  }}
                />
              ))}
            </div>

            {/* 2. Video Track Lanes — pointerdown on empty lane space starts a marquee selection */}
            <div className="flex flex-col" onPointerDown={startMarquee} onContextMenu={handleLaneContextMenu}>
              {project.tracks
                .filter(t => t.type === 'video')
                .map(track => (
                  <div
                    key={track.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleTrackDrop(e, track.id)}
                    data-track-row={track.id}
                    className={`h-14 border-b border-[#292929] relative transition-colors ${
                      dragHoverTrack === track.id && isDragging
                        ? 'bg-[#16294f] ring-1 ring-inset ring-[#1473e6]'
                        : 'bg-[#1a1a1a]'
                    }`}
                  >
                    {project.clips
                      .filter(c => c.trackId === track.id)
                      .map(clip => {
                        const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
                        const clipWidth = Math.max(10, clip.duration * zoom);
                        const clipLeft = clip.startTime * zoom;

                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            onPointerDown={e => handleClipPointerDown(e, clip)}
                            onContextMenu={e => handleClipContextMenu(e, clip.id)}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                              backgroundColor: clip.color
                            }}
                            className={`absolute top-1 bottom-1 rounded-sm shadow-md flex items-center justify-between px-2 cursor-pointer select-none border overflow-hidden ${
                              isSelected
                                ? 'ring-2 ring-white border-white brightness-110'
                                : 'border-black/30 hover:brightness-110'
                            } ${!track.visible ? 'opacity-40' : ''}`}
                          >
                            {/* Left trim handle */}
                            <div
                              onPointerDown={e => handleTrimStart(e, clip, 'start')}
                              title="Trim Start"
                              className="absolute left-0 top-0 bottom-0 w-2 hover:w-3 bg-white/25 hover:bg-white/70 cursor-ew-resize rounded-l-sm transition-all z-10"
                            />

                            {/* Filmstrip video preview frames */}
                            {renderFilmstrip(clip, clipWidth)}

                            {/* Clip label */}
                            <div className="absolute top-0 left-0 right-1 h-4 bg-gradient-to-b from-black/55 to-transparent pointer-events-none z-[5]" />
                            <div className="flex items-center space-x-1.5 truncate pointer-events-none text-white text-[11px] font-medium drop-shadow-sm z-[6] pl-3">
                              {clip.textProperties && <span className="text-[10px]">T</span>}
                              <span className="truncate">{clip.name}</span>
                              <span className="text-[10px] opacity-75 font-mono shrink-0">[{clip.duration.toFixed(1)}s]</span>
                            </div>

                            {/* Right trim handle */}
                            <div
                              onPointerDown={e => handleTrimStart(e, clip, 'end')}
                              title="Trim End"
                              className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 bg-white/25 hover:bg-white/70 cursor-ew-resize rounded-r-sm transition-all z-10"
                            />
                          </div>
                        );
                      })}
                  </div>
                ))}
            </div>

            {/* Heavy Horizontal Track Divider */}
            <div className="h-1 bg-[#1473e6] opacity-70" />

            {/* 3. Audio Track Lanes — marquee selection works here too */}
            <div className="flex flex-col" onPointerDown={startMarquee} onContextMenu={handleLaneContextMenu}>
              {project.tracks
                .filter(t => t.type === 'audio')
                .map(track => (
                  <div
                    key={track.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleTrackDrop(e, track.id)}
                    data-track-row={track.id}
                    className={`h-14 border-b border-[#262626] relative transition-colors ${
                      dragHoverTrack === track.id && isDragging
                        ? 'bg-[#16294f] ring-1 ring-inset ring-[#1473e6]'
                        : 'bg-[#161616]'
                    }`}
                  >
                    {project.clips
                      .filter(c => c.trackId === track.id)
                      .map(clip => {
                        const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
                        const clipWidth = Math.max(10, clip.duration * zoom);
                        const clipLeft = clip.startTime * zoom;

                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            onPointerDown={e => handleClipPointerDown(e, clip)}
                            onContextMenu={e => handleClipContextMenu(e, clip.id)}
                            style={{
                              left: `${clipLeft}px`,
                              width: `${clipWidth}px`,
                              backgroundColor: clip.color
                            }}
                            className={`absolute top-1 bottom-1 rounded-sm shadow-md flex items-center cursor-pointer select-none border overflow-hidden ${
                              isSelected
                                ? 'ring-2 ring-white border-white brightness-110'
                                : 'border-black/30 hover:brightness-110'
                            } ${track.muted ? 'opacity-40' : ''}`}
                          >
                            {/* Left trim handle */}
                            <div
                              onPointerDown={e => handleTrimStart(e, clip, 'start')}
                              title="Trim Start"
                              className="absolute left-0 top-0 bottom-0 w-2 hover:w-3 bg-white/25 hover:bg-white/70 cursor-ew-resize rounded-l-sm transition-all z-10"
                            />

                            {/* Audio Waveform bars */}
                            {renderAudioWaveform(clip, clipWidth)}

                            {/* Clip label overlay (top) */}
                            <div className="absolute top-0.5 left-3 right-3 flex items-center space-x-1 pointer-events-none">
                              <span className="text-white text-[11px] font-medium drop-shadow-sm truncate">{clip.name}</span>
                              <span className="text-[10px] opacity-60 font-mono text-white shrink-0">[{clip.duration.toFixed(1)}s]</span>
                            </div>

                            {/* Right trim handle */}
                            <div
                              onPointerDown={e => handleTrimStart(e, clip, 'end')}
                              title="Trim End"
                              className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 bg-white/25 hover:bg-white/70 cursor-ew-resize rounded-r-sm transition-all z-10"
                            />
                          </div>
                        );
                      })}
                  </div>
                ))}
            </div>

            {/* 4. Playhead Current Time Indicator (CTI) */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-30"
              style={{ left: `${playhead * zoom}px` }}
            >
              {/* Playhead Head (diamond) */}
              <div className="w-3.5 h-3.5 -ml-[7px] bg-[#1473e6] rotate-45 transform origin-center shadow-lg border border-white/50" />
              {/* Playhead vertical needle */}
              <div className="w-0.5 h-full bg-[#1473e6] shadow-[0_0_8px_rgba(20,115,230,0.8)]" />
            </div>

            {/* 5. Marquee selection rectangle (drag-box multi-select) */}
            {marqueeBox && (() => {
              const content = contentRef.current;
              const left = content ? Math.min(marqueeBox.x0, marqueeBox.x1) - content.getBoundingClientRect().left : 0;
              const top = content ? Math.min(marqueeBox.y0, marqueeBox.y1) - content.getBoundingClientRect().top : 0;
              const w = Math.abs(marqueeBox.x1 - marqueeBox.x0);
              const h = Math.abs(marqueeBox.y1 - marqueeBox.y0);
              return (
                <div
                  className="absolute pointer-events-none z-40 border border-[#1473e6] bg-[#1473e6]/15"
                  style={{ left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` }}
                />
              );
            })()}
          </div>
        </div>
      </div>

      {/* Right-Click Context Menu (on a clip) */}
      {contextMenu && contextClip && (
        <div
          className="fixed z-[100] bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 text-xs text-gray-200 w-52"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-[#333] truncate font-mono">
            {contextClip.name}
          </div>
          <button
            onClick={() => { splitClipAt(contextClip.id, playhead); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center space-x-2"
          >
            <Scissors className="w-3.5 h-3.5 shrink-0" />
            <span>Split at Playhead</span>
            <span className="ml-auto text-gray-500">Ctrl+K</span>
          </button>
          <div className="h-px bg-[#333] my-1" />
          <button
            onClick={() => { setSelectedClipId(contextClip.id); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2e2e2e]"
          >
            Select Clip
          </button>
          <div className="h-px bg-[#333] my-1" />
          {selectedClipIds.length > 1 && (
            <button
              onClick={() => { deleteAllSelected(); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 hover:bg-red-700 text-red-400 hover:text-white flex items-center space-x-2"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Delete All Selected ({selectedClipIds.length})</span>
              <span className="ml-auto text-gray-500">Del</span>
            </button>
          )}
          <button
            onClick={() => { deleteClip(contextClip.id, false); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-red-700 text-red-400 hover:text-white"
          >
            Delete Clip
          </button>
          <button
            onClick={() => { deleteClip(contextClip.id, true); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-red-700 text-red-400 hover:text-white"
          >
            Ripple Delete
          </button>
        </div>
      )}

      {/* Right-Click Context Menu (on empty timeline space) */}
      {contextMenu && !contextMenu.clipId && !contextMenu.trackId && (
        <div
          className="fixed z-[100] bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 text-xs text-gray-200 w-56"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-[#333] font-mono">TIMELINE</div>
          <button
            onClick={() => { setSelectedClipIds(project.clips.map(c => c.id)); setSelectedClipId(project.clips[0]?.id ?? null); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6]"
          >
            Select All Clips ({project.clips.length})
          </button>
          <div className="h-px bg-[#333] my-1" />
          <button
            disabled={selectedCount === 0}
            onClick={() => { deleteAllSelected(); setContextMenu(null); }}
            className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 ${
              selectedCount > 0
                ? 'hover:bg-red-700 text-red-400 hover:text-white'
                : 'text-gray-600 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Delete Selected Clips ({selectedCount})</span>
          </button>
        </div>
      )}

      {/* Right-Click Context Menu (on a track header) */}
      {contextMenu && contextMenu.trackId && (() => {
        const track = project.tracks.find(t => t.id === contextMenu.trackId);
        if (!track) return null;
        const hasClips = project.clips.some(c => c.trackId === track.id);
        const sameTypeCount = project.tracks.filter(t => t.type === track.type).length;
        const canDelete = !hasClips && sameTypeCount > 1;
        return (
          <div
            className="fixed z-[100] bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 text-xs text-gray-200 w-60"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-[#333] font-mono flex items-center justify-between">
              <span>TRACK {track.name}</span>
              <span className={hasClips ? 'text-amber-400' : 'text-gray-600'}>
                {hasClips ? `${project.clips.filter(c => c.trackId === track.id).length} clip(s)` : 'empty'}
              </span>
            </div>
            <button
              onClick={() => { addTrack('video'); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6]"
            >
              Add Video Track
            </button>
            <button
              onClick={() => { addTrack('audio'); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6]"
            >
              Add Audio Track
            </button>
            <div className="h-px bg-[#333] my-1" />
            <button
              disabled={!canDelete}
              onClick={() => { if (canDelete) removeTrack(track.id); setContextMenu(null); }}
              title={hasClips ? 'Move or delete the clips on this track first' : undefined}
              className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 ${
                canDelete
                  ? 'hover:bg-red-700 text-red-400 hover:text-white'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                Delete Track {track.name}
                {hasClips && ' (has clips)'}
              </span>
            </button>
          </div>
        );
      })()}

      {/* Floating "Delete all" chip when multiple clips are selected */}
      {selectedClipIds.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 bg-[#252525]/95 border border-[#3c3c3c] rounded-full shadow-2xl px-3 py-1.5">
          <span className="text-xs text-gray-300 font-medium whitespace-nowrap">{selectedClipIds.length} clips selected</span>
          <button
            onClick={deleteAllSelected}
            title="Delete all selected clips (Del)"
            className="text-xs px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center space-x-1.5 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete All</span>
          </button>
        </div>
      )}
    </div>
  );
};
