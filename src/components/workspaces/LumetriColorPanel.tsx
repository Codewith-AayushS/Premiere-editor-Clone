import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditor, LUT_PRESETS } from '../../context/EditorContext';
import type { EnhancedColorGrade, CurveChannel, CurvePoint, ColorWheel } from '../../types/editor';
import { DEFAULT_GRADE } from '../../utils/colorProcessing';
import { 
  Palette, 
  Sun, 
  RotateCcw, 
  Sparkles, 
  ChevronDown, 
  ChevronRight,
  CircleDot,
  Moon,
  Scissors,
  Sliders,
  Droplets,
  Eye,
  Link2,
  Copy,
  RefreshCw,
} from 'lucide-react';

const LUT_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'modern', label: 'Modern' },
  { id: 'monochrome', label: 'Monochrome' },
  { id: 'creative', label: 'Creative' },
];

type SectionKey = 'basic' | 'tone' | 'creative' | 'curves' | 'wheels' | 'hsl' | 'vignette';

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentColor?: string;
  gradientStyle?: React.CSSProperties;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', accentColor = 'accent-blue-500', gradientStyle, onChange }) => (
  <div>
    <div className="flex justify-between text-[11px] mb-1">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono ${accentColor.replace('accent-', 'text-')}`}>
        {value > 0 && min < 0 ? `+${value}` : value}{unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className={`w-full h-1.5 rounded appearance-none cursor-pointer ${!gradientStyle ? accentColor + ' bg-[#141414]' : ''}`}
      style={gradientStyle}
    />
  </div>
);

const CurveCanvas: React.FC<{
  channel: CurveChannel;
  points: CurvePoint[];
  onPointsChange: (points: CurvePoint[]) => void;
  color: string;
  label: string;
}> = ({ channel, points, onPointsChange, color, label }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragPointIdx, setDragPointIdx] = useState<number | null>(null);
  const [localPoints, setLocalPoints] = useState<CurvePoint[]>(points);

  useEffect(() => {
    setLocalPoints(points);
  }, [points]);

  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = (w / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Curve line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.moveTo(0, h - localPoints[0].y * h);
    for (let i = 1; i < localPoints.length; i++) {
      const cp1x = ((localPoints[i - 1].x + localPoints[i].x) / 2) * w;
      const cp1y = (h - localPoints[i - 1].y * h);
      const cp2x = ((localPoints[i - 1].x + localPoints[i].x) / 2) * w;
      const cp2y = (h - localPoints[i].y * h);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, localPoints[i].x * w, h - localPoints[i].y * h);
    }
    ctx.stroke();

    // Control points
    localPoints.forEach((p, idx) => {
      const x = p.x * w;
      const y = h - p.y * h;
      ctx.fillStyle = idx === dragPointIdx ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    });
  }, [localPoints, channel, color, dragPointIdx]);

  useEffect(() => {
    drawCurve();
  }, [drawCurve]);

  const getPointAt = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (rect.height - (e.clientY - rect.top)) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pt = getPointAt(e);
    if (!pt) return;
    let closestIdx = -1;
    let closestDist = 0.1;
    localPoints.forEach((p, idx) => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = idx;
      }
    });
    if (closestIdx >= 0) {
      setIsDragging(true);
      setDragPointIdx(closestIdx);
    } else {
      // Add new point
      const newPoints = [...localPoints, { x: pt.x, y: pt.y }].sort((a, b) => a.x - b.x);
      setLocalPoints(newPoints);
      onPointsChange(newPoints);
      setDragPointIdx(newPoints.length - 1);
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || dragPointIdx === null) return;
    const pt = getPointAt(e);
    if (!pt) return;
    const newPoints = [...localPoints];
    newPoints[dragPointIdx] = { ...newPoints[dragPointIdx], x: pt.x, y: pt.y };
    newPoints.sort((a, b) => a.x - b.x);
    const newIdx = newPoints.findIndex(p => p.x === pt.x && p.y === pt.y);
    setLocalPoints(newPoints);
    setDragPointIdx(newIdx);
    onPointsChange(newPoints);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragPointIdx(null);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragPointIdx, handleMouseMove, handleMouseUp]);

  return (
    <div className="relative w-full h-48 bg-[#141414] border border-[#333] rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        className="w-full h-full cursor-crosshair"
      />
      <div className="absolute top-1 left-1 flex gap-1 pointer-events-none">
        <span className="text-[9px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">0,0</span>
        <span className="text-[9px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">1,1</span>
      </div>
      <div className="absolute -top-8 left-0 right-0 flex justify-between text-[9px] text-gray-500 px-2">
        <span>Shadows</span>
        <span>Midtones</span>
        <span>Highlights</span>
      </div>
      <div className="flex justify-between text-[9px] text-gray-500 px-2">
        <span>{label}</span>
        <span>Channel: {channel}</span>
      </div>
    </div>
  );
};

const ColorWheelControl: React.FC<{
  label: string;
  wheel: ColorWheel;
  onChange: (wheel: ColorWheel) => void;
}> = ({ label, wheel, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 120;
    const center = size / 2;
    const radius = size / 2 - 10;

    ctx.clearRect(0, 0, size, size);

    // Color wheel gradient
    for (let angle = 0; angle < 360; angle += 5) {
      const rad = (angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, rad, rad + (5 * Math.PI) / 180);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(
        center + Math.cos(rad) * (radius / 2),
        center + Math.sin(rad) * (radius / 2),
        center + Math.cos(rad) * radius,
        center + Math.sin(rad) * radius
      );
      gradient.addColorStop(0, `hsl(${angle}, 100%, 50%)`);
      gradient.addColorStop(1, `hsl(${angle}, 100%, 0%)`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Selected color indicator
    const rad = (wheel.angle * Math.PI) / 180;
    const rx = center + Math.cos(rad) * (radius * (wheel.magnitude / 100));
    const ry = center + Math.sin(rad) * (radius * (wheel.magnitude / 100));
    ctx.fillStyle = wheel.magnitude > 0 ? `hsl(${wheel.angle}, 100%, 50%)` : '#fff';
    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [wheel]);

  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const center = rect.width / 2;
    const dx = x - center;
    const dy = y - center;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const normalizedAngle = ((angle + 360) % 360);
    const dist = Math.min(Math.hypot(dx, dy) / (rect.width / 2 - 10), 1);
    const newWheel: ColorWheel = {
      angle: normalizedAngle,
      magnitude: Math.round(dist * 100),
    };
    onChange(newWheel);
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const center = rect.width / 2;
    const dx = x - center;
    const dy = y - center;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const normalizedAngle = ((angle + 360) % 360);
    const dist = Math.min(Math.hypot(dx, dy) / (rect.width / 2 - 10), 1);
    const newWheel: ColorWheel = {
      angle: normalizedAngle,
      magnitude: Math.round(dist * 100),
    };
    onChange(newWheel);
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col items-center p-2 bg-[#181818] border border-[#333] rounded">
      <span className="text-[10px] text-gray-400 font-medium mb-1">{label}</span>
      <canvas
        ref={canvasRef}
        width={120}
        height={120}
        onMouseDown={handleMouseDown}
        className="cursor-crosshair mb-1"
      />
      <div className="flex gap-2 text-[10px] text-gray-400">
        <span>{wheel.angle}deg</span>
        <span>{wheel.magnitude}</span>
      </div>
    </div>
  );
};

export const LumetriColorPanel: React.FC = () => {
  const { 
    project, 
    playhead, 
    selectedClipId: userSelectedClipId, 
    setSelectedClipId: _setSelectedClipId, 
    updateClipColorGrade,
    updateClipCurves,
    updateClipHSLSecondary,
    updateClipColorWheels,
    updateHueVsSat: _updateHueVsSat,
    updateHueVsHue: _updateHueVsHue,
    toggleBeforeAfter,
    setBeforeAfterSplit,
    setReferenceClip,
    matchColorFromClip,
    beforeAfterState,
  } = useEditor();

  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    basic: true,
    tone: true,
    curves: true,
    wheels: true,
    hsl: false,
    vignette: false,
    creative: true,
  });

  const [activeCurve, setActiveCurve] = useState<CurveChannel>('master');
  const [activeLUTCategory, setActiveLUTCategory] = useState<string>('all');
  const [copySourceGrade, setCopySourceGrade] = useState<EnhancedColorGrade | null>(null);

  // Auto-targeting: if the user hasn't picked a clip, the Lumetri panel
  // automatically operates on the clip currently under the playhead
  // (V3 -> V2 -> V1 top-most wins), just like Premiere's color workspace.
  const explicitClip = project.clips.find(c => c.id === userSelectedClipId);
  const clipUnderPlayhead = project.clips.find(c => {
    return (c.type === 'video' || c.type === 'image') &&
      !c.textProperties &&
      playhead >= c.startTime && playhead < c.startTime + c.duration;
  });
  const selectedClip = explicitClip || clipUnderPlayhead;
  const isAutoTargeted = !explicitClip && !!clipUnderPlayhead;
  const grade: EnhancedColorGrade = selectedClip?.colorGrade || DEFAULT_GRADE;

  // All panel handlers below operate on `selectedClipId`, which always
  // points at the auto-targeted clip (manual selection wins if set).
  const selectedClipId: string | null = selectedClip?.id ?? null;

  const toggleSection = (section: SectionKey) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (field: keyof EnhancedColorGrade, value: number | string) => {
    if (!selectedClip) return;
updateClipColorGrade(selectedClip.id, { [field]: value });
  };

  const handleReset = () => {
    if (!selectedClip) return;
updateClipColorGrade(selectedClip.id, DEFAULT_GRADE);
  };

  const handleCopyGrade = () => {
    if (!selectedClip?.colorGrade) return;
    setCopySourceGrade(selectedClip.colorGrade);
  };

  const handlePasteGrade = () => {
    if (!selectedClip || !copySourceGrade) return;
updateClipColorGrade(selectedClip.id, { ...copySourceGrade });
  };

  const handleMatchColor = () => {
    if (!selectedClip) {
      alert('Select a target clip first.');
      return;
    }
    const otherClip = project.clips.find(c => c.id !== selectedClip.id && c.colorGrade);
    if (!otherClip) {
      alert('No other graded clip found to match from.');
      return;
    }
    matchColorFromClip(otherClip.id, selectedClip.id);
    setReferenceClip(otherClip.id);
  };

  const SectionHeader: React.FC<{ 
    section: SectionKey; 
    icon: React.ReactNode; 
    label: string; 
    iconColor?: string;
  }> = ({ section, icon, label, iconColor = 'text-amber-400' }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between px-3 py-2 bg-[#282828] hover:bg-[#2c2c2c] text-white font-semibold text-left transition"
    >
      <span className={`flex items-center space-x-1.5 ${iconColor}`}>
        <span className="w-3.5 h-3.5">{icon}</span>
        <span className="text-white">{label}</span>
      </span>
      {expandedSections[section] ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#2d2d2d] select-none text-xs text-gray-200 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#252525] border-b border-[#2d2d2d] sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <Palette className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-white">Lumetri Color</span>
        </div>
        <div className="flex items-center space-x-1">
          {selectedClip && (
            <>
              <button
                onClick={handleCopyGrade}
                title="Copy Grade"
                className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={handlePasteGrade}
                disabled={!copySourceGrade}
                title="Paste Grade"
                className={`p-1 rounded text-gray-400 hover:text-white ${!copySourceGrade ? 'opacity-40' : ''}`}
              >
                <Scissors className="w-3 h-3" />
              </button>
              <button
                onClick={handleMatchColor}
                title="Match Color from Another Clip"
                className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"
              >
                <Link2 className="w-3 h-3" />
              </button>
              <button
                onClick={handleReset}
                title="Reset Grade"
                className="flex items-center space-x-1 text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded bg-[#181818] border border-[#333]"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </>
          )}
        </div>
      </div>

      {!selectedClip ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500 space-y-2">
          <Palette className="w-8 h-8 opacity-30" />
          <span className="font-medium text-gray-300">No Clip to Color</span>
          <p className="text-[11px] text-gray-500">Select a clip on the timeline — or just place the playhead over a clip — and it becomes the color target automatically.</p>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {/* Active Clip Banner */}
          <div className="bg-[#181818] border border-[#2d2d2d] rounded p-2 flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="font-mono text-cyan-400 truncate text-[11px]">{selectedClip.name}</span>
              {isAutoTargeted && (
                <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-bold shrink-0" title="Automatically targeting the clip under the playhead. Select a clip to lock the panel to it.">
                  AUTO · PLAYHEAD
                </span>
              )}
            </div>
            <span className="text-[10px] bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
              {selectedClip.type}
            </span>
          </div>

          {/* 1. Basic Correction - White Balance */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="basic" icon={<Sun className="w-3.5 h-3.5" />} label="White Balance" iconColor="text-amber-400" />
            {expandedSections.basic && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <SliderRow
                  label="Temperature"
                  value={grade.temperature}
                  min={-100} max={100}
                  accentColor="accent-amber-400"
                  gradientStyle={{ background: 'linear-gradient(to right, #00b0ff 0%, #333 50%, #ff9100 100%)' }}
                  onChange={v => handleChange('temperature', v)}
                />
                <SliderRow
                  label="Tint"
                  value={grade.tint}
                  min={-100} max={100}
                  accentColor="accent-pink-400"
                  gradientStyle={{ background: 'linear-gradient(to right, #00e676 0%, #333 50%, #e040fb 100%)' }}
                  onChange={v => handleChange('tint', v)}
                />
              </div>
            )}
          </div>

          {/* 2. Tone Controls */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="tone" icon={<Sun className="w-3.5 h-3.5" />} label="Tone" iconColor="text-blue-400" />
            {expandedSections.tone && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <SliderRow label="Exposure" value={grade.exposure} min={-2.5} max={2.5} step={0.05} unit=" EV" accentColor="accent-blue-400" onChange={v => handleChange('exposure', v)} />
                <SliderRow label="Contrast" value={grade.contrast} min={-100} max={100} accentColor="accent-blue-400" onChange={v => handleChange('contrast', v)} />
                <div className="h-px bg-[#333] my-1" />
                <SliderRow label="Highlights" value={grade.highlights} min={-100} max={100} accentColor="accent-yellow-300" onChange={v => handleChange('highlights', v)} />
                <SliderRow label="Shadows" value={grade.shadows} min={-100} max={100} accentColor="accent-blue-300" onChange={v => handleChange('shadows', v)} />
                <div className="h-px bg-[#333] my-1" />
                <SliderRow label="Whites" value={grade.whites} min={-100} max={100} accentColor="accent-gray-200" onChange={v => handleChange('whites', v)} />
                <SliderRow label="Blacks" value={grade.blacks} min={-100} max={100} accentColor="accent-gray-500" onChange={v => handleChange('blacks', v)} />
                <div className="h-px bg-[#333] my-1" />
                <SliderRow label="Saturation" value={grade.saturation} min={0} max={200} unit="%" accentColor="accent-emerald-400" onChange={v => handleChange('saturation', v)} />
              </div>
            )}
          </div>

          {/* 3. RGB Curves */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="curves" icon={<Sliders className="w-3.5 h-3.5" />} label="RGB Curves" iconColor="text-purple-400" />
            {expandedSections.curves && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                {/* Channel selector */}
                <div className="flex gap-1 mb-2">
                  {(['master', 'red', 'green', 'blue'] as CurveChannel[]).map(ch => (
                    <button
                      key={ch}
                      onClick={() => setActiveCurve(ch)}
                      className={`flex-1 py-1 rounded text-[10px] font-medium border transition ${
                        activeCurve === ch
                          ? 'bg-[#1473e6] text-white border-blue-500'
                          : 'bg-[#181818] border-[#333] text-gray-400 hover:text-white'
                      }`}
                    >
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </button>
                  ))}
                </div>

                <CurveCanvas
                  channel={activeCurve}
                  points={grade.curves?.[activeCurve] || DEFAULT_GRADE.curves![activeCurve]}
                  onPointsChange={(pts) => {
                    if (!selectedClipId) return;
                    updateClipCurves(selectedClipId, activeCurve, pts);
                  }}
                  color={activeCurve === 'master' ? '#ffffff' : activeCurve === 'red' ? '#ff4444' : activeCurve === 'green' ? '#00ff00' : '#0088ff'}
                  label={activeCurve.charAt(0).toUpperCase() + activeCurve.slice(1) + ' Curve'}
                />

                <div className="text-[10px] text-gray-500 bg-[#181818] border border-[#2a2a2a] rounded p-2">
                  Drag control points to shape the curve. Click to add points. Drag points off-canvas to remove.
                </div>
              </div>
            )}
          </div>

          {/* 4. Color Wheels */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="wheels" icon={<CircleDot className="w-3.5 h-3.5" />} label="3-Way Color Wheels" iconColor="text-cyan-400" />
            {expandedSections.wheels && (
              <div className="p-3 space-y-4 border-t border-[#2f2f2f]">
                <div className="grid grid-cols-3 gap-3">
                  <ColorWheelControl
                    label="Shadows"
                    wheel={grade.wheels?.shadows || { angle: 0, magnitude: 0 }}
                    onChange={(w) => {
                      if (!selectedClipId) return;
                      updateClipColorWheels(selectedClipId, 'shadows', w);
                    }}
                  />
                  <ColorWheelControl
                    label="Midtones"
                    wheel={grade.wheels?.midtones || { angle: 0, magnitude: 0 }}
                    onChange={(w) => {
                      if (!selectedClipId) return;
                      updateClipColorWheels(selectedClipId, 'midtones', w);
                    }}
                  />
                  <ColorWheelControl
                    label="Highlights"
                    wheel={grade.wheels?.highlights || { angle: 0, magnitude: 0 }}
                    onChange={(w) => {
                      if (!selectedClipId) return;
                      updateClipColorWheels(selectedClipId, 'highlights', w);
                    }}
                  />
                </div>
                <ColorWheelControl
                  label="Global"
                  wheel={grade.wheels?.global || { angle: 0, magnitude: 0 }}
                  onChange={(w) => {
                    if (!selectedClipId) return;
                    updateClipColorWheels(selectedClipId, 'global', w);
                  }}
                />
              </div>
            )}
          </div>

          {/* 5. HSL Secondary */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="hsl" icon={<Droplets className="w-3.5 h-3.5" />} label="HSL Secondary" iconColor="text-emerald-400" />
            {expandedSections.hsl && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={grade.hslSecondary?.enabled || false}
                    onChange={e => {
                      if (!selectedClipId) return;
                      updateClipHSLSecondary(selectedClipId, { enabled: e.target.checked });
                    }}
                    className="accent-emerald-500 rounded"
                  />
                  <label className="text-xs text-gray-300 font-medium">Enable HSL Secondary</label>
                </div>
                {grade.hslSecondary?.enabled && (
                  <div className="space-y-3">
                    <SliderRow
                      label="Hue"
                      value={grade.hslSecondary.hue}
                      min={0} max={360}
                      accentColor="accent-purple-400"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { hue: v });
                      }}
                    />
                    <SliderRow
                      label="Hue Range"
                      value={grade.hslSecondary.hueRange}
                      min={0} max={100}
                      accentColor="accent-purple-400"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { hueRange: v });
                      }}
                    />
                    <SliderRow
                      label="Saturation"
                      value={grade.hslSecondary.saturation}
                      min={-100} max={100}
                      accentColor="accent-pink-400"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { saturation: v });
                      }}
                    />
                    <SliderRow
                      label="Saturation Range"
                      value={grade.hslSecondary.satRange}
                      min={0} max={100}
                      accentColor="accent-pink-400"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { satRange: v });
                      }}
                    />
                    <SliderRow
                      label="Luminance"
                      value={grade.hslSecondary.luminance}
                      min={-100} max={100}
                      accentColor="accent-yellow-300"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { luminance: v });
                      }}
                    />
                    <SliderRow
                      label="Luminance Range"
                      value={grade.hslSecondary.lumRange}
                      min={0} max={100}
                      accentColor="accent-yellow-300"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { lumRange: v });
                      }}
                    />
                    <div className="h-px bg-[#333] my-1" />
                    <SliderRow
                      label="Temp Correction"
                      value={grade.hslSecondary.temp}
                      min={-100} max={100}
                      accentColor="accent-amber-400"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { temp: v });
                      }}
                    />
                    <SliderRow
                      label="Exposure Correction"
                      value={grade.hslSecondary.exposure}
                      min={-100} max={100}
                      accentColor="accent-blue-400"
                      onChange={v => {
                        if (!selectedClipId) return;
                        updateClipHSLSecondary(selectedClipId, { exposure: v });
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. Creative / LUTs */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="creative" icon={<Sparkles className="w-3.5 h-3.5" />} label="Creative Look / LUTs" iconColor="text-purple-400" />
            {expandedSections.creative && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                {/* Category filter */}
                <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                  {LUT_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveLUTCategory(cat.id)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition ${
                        activeLUTCategory === cat.id
                          ? 'bg-[#1473e6] text-white border-blue-500'
                          : 'bg-[#181818] border-[#333] text-gray-400 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* LUT Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {LUT_PRESETS.filter(l => activeLUTCategory === 'all' || l.category === activeLUTCategory).map(lut => (
                    <div
                      key={lut.id}
                      onClick={() => {
                        if (!selectedClipId) return;
                        handleChange('lut', lut.name);
                      }}
                      className={`p-2 rounded border cursor-pointer transition flex flex-col ${
                        grade.lut === lut.name
                          ? 'bg-[#1473e6]/20 border-blue-500'
                          : 'bg-[#181818] border-[#333] hover:border-gray-500'
                      }`}
                    >
                      <div className="h-8 rounded bg-[#000] border border-[#444] flex items-center justify-center mb-1 overflow-hidden">
                        <span className="text-[9px] text-gray-400 font-mono">{lut.name.slice(0, 12)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-gray-300 font-medium truncate">{lut.name}</span>
                        <span className="text-[9px] text-gray-500">{lut.category}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] text-gray-500 bg-[#181818] border border-[#2a2a2a] rounded p-2 mt-2">
                  LUTs are approximated with CSS filters for real-time preview. Full LUT cube support applied at FFmpeg export.
                </div>
              </div>
            )}
          </div>

          {/* 7. Vignette */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="vignette" icon={<Moon className="w-3.5 h-3.5" />} label="Vignette" iconColor="text-gray-300" />
            {expandedSections.vignette && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <SliderRow
                  label="Amount"
                  value={grade.vignette}
                  min={0} max={100}
                  unit="%"
                  accentColor="accent-gray-400"
                  onChange={v => handleChange('vignette', v)}
                />
                <div className="text-[10px] text-gray-500 bg-[#181818] border border-[#2a2a2a] rounded p-2">
                  Darkens edges of the frame for cinematic depth. Applied to canvas rendering.
                </div>
              </div>
            )}
          </div>

          {/* Before/After Controls */}
          {selectedClip && (
            <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden mt-2">
              <button
                onClick={toggleBeforeAfter}
                className={`w-full py-2 flex items-center justify-between border-b border-[#333] last:border-0 transition ${
                  beforeAfterState.enabled ? 'bg-[#1473e6]/20' : ''
                }`}
              >
                <div className="flex items-center space-x-2 px-3">
                  <Eye className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium text-white">Before / After</span>
                  <span className={`text-[9px] ${beforeAfterState.enabled ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {beforeAfterState.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="px-3">
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={beforeAfterState.splitPosition}
                    onChange={e => setBeforeAfterSplit(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 h-1 bg-[#141414] rounded cursor-pointer"
                  />
                </div>
              </button>
              {beforeAfterState.enabled && (
                <div className="p-3 border-t border-[#333]">
                  <button
                    onClick={() => setReferenceClip(selectedClipId)}
                    className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-[#333] text-[10px] text-gray-400 hover:text-white"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Use current as reference</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
