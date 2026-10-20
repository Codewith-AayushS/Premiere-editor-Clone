import React, { useState, useCallback } from 'react';
import { useEditor } from '../../context/EditorContext';
import { isCaptionClip } from '../../utils/captions';
import type { 
  TextProperties, 
  ShapeLayer, 
  TextAnimation, 
  MotionGraphicsTemplate,
  PinPosition,
  ShapeType,
  TextAnimationType,
  EasingType,
} from '../../types/editor';
import { 
  Type, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Plus, 
  Square,
  Circle,
  Minus,
  Trash2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Move,
  Pin,
  Monitor,
  Zap,
  Link2,
  Subtitles,
} from 'lucide-react';

const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'lower-third', label: 'Lower Third' },
  { id: 'end-screen', label: 'End Screen' },
  { id: 'social', label: 'Social' },
  { id: 'news', label: 'News' },
  { id: 'sports', label: 'Sports' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'instagram', label: 'Instagram' },
];

const ANIMATION_PRESETS: { id: TextAnimationType; label: string; icon: React.ReactNode }[] = [
  { id: 'none', label: 'None', icon: <span className="w-3 h-3 text-gray-400" /> },
  { id: 'fade-in', label: 'Fade In', icon: <span className="w-3 h-3 text-emerald-400 opacity-50 animate-pulse" /> },
  { id: 'fade-out', label: 'Fade Out', icon: <span className="w-3 h-3 text-rose-400 opacity-50" /> },
  { id: 'slide-left', label: 'Slide Left', icon: <span className="w-3 h-3 text-blue-400" /> },
  { id: 'slide-right', label: 'Slide Right', icon: <span className="w-3 h-3 text-blue-400" /> },
  { id: 'slide-up', label: 'Slide Up', icon: <span className="w-3 h-3 text-blue-400" /> },
  { id: 'slide-down', label: 'Slide Down', icon: <span className="w-3 h-3 text-blue-400" /> },
  { id: 'typewriter', label: 'Typewriter', icon: <span className="w-3 h-3 text-purple-400" /> },
  { id: 'bounce', label: 'Bounce', icon: <span className="w-3 h-3 text-amber-400 animate-bounce" /> },
  { id: 'glitch', label: 'Glitch', icon: <span className="w-3 h-3 text-pink-400" /> },
  { id: 'scale-up', label: 'Scale Up', icon: <span className="w-3 h-3 text-indigo-400" /> },
  { id: 'blur-in', label: 'Blur In', icon: <span className="w-3 h-3 text-cyan-400" /> },
  { id: 'kinetic', label: 'Kinetic', icon: <span className="w-3 h-3 text-orange-400" /> },
];

const EASING_OPTIONS: { id: EasingType; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'ease-in-out', label: 'Ease In-Out' },
];

const PIN_POSITIONS: { id: PinPosition; label: string; icon: React.ReactNode }[] = [
  { id: 'none', label: 'Free', icon: <Move className="w-3 h-3" /> },
  { id: 'top-left', label: 'Top-Left', icon: <Pin className="w-3 h-3" /> },
  { id: 'top-right', label: 'Top-Right', icon: <Pin className="w-3 h-3" /> },
  { id: 'bottom-left', label: 'Bottom-Left', icon: <Pin className="w-3 h-3" /> },
  { id: 'bottom-right', label: 'Bottom-Right', icon: <Pin className="w-3 h-3" /> },
  { id: 'center', label: 'Center', icon: <Pin className="w-3 h-3" /> },
];

const SHAPE_TYPES: { id: ShapeType; label: string; icon: React.ReactNode }[] = [
  { id: 'rectangle', label: 'Rectangle', icon: <Square className="w-3 h-3" /> },
  { id: 'circle', label: 'Circle', icon: <Circle className="w-3 h-3" /> },
  { id: 'ellipse', label: 'Ellipse', icon: <Circle className="w-3 h-3" /> },
  { id: 'line', label: 'Line', icon: <Minus className="w-3 h-3" /> },
  { id: 'arrow', label: 'Arrow', icon: <Monitor className="w-3 h-3" /> },
];

type SectionKey = 'templates' | 'text' | 'animation' | 'shapes' | 'responsive' | 'essential';

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accentColor?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', accentColor = 'accent-blue-500', onChange }) => (
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
      className={`w-full h-1.5 rounded appearance-none cursor-pointer ${accentColor} bg-[#141414]`}
    />
  </div>
);

const ColorSwatch: React.FC<{
  value: string;
  onChange: (v: string) => void;
  label: string;
}> = ({ value, onChange, label }) => (
  <div className="flex items-center space-x-2">
    <label className="text-[10px] text-gray-400 w-16">{label}</label>
    <input
      type="color"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-8 h-7 bg-transparent rounded cursor-pointer border border-[#3a3a3a]"
    />
    <span className="font-mono text-[11px] text-gray-300 w-12">{value}</span>
  </div>
);

/** Integer field that keeps intermediate drafts (like "-") intact while typing. */
const IntegerField: React.FC<{
  value: number;
  onChange: (value: number) => void;
  className?: string;
}> = ({ value, onChange, className = '' }) => {
  // Keep the raw text only while it belongs to the value we last saw. As soon as
  // the value changes (typing, dragging, presets), the field derives it again.
  const [draft, setDraft] = useState<{ base: number; text: string } | null>(null);
  const text = draft && draft.base === value ? draft.text : String(value);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => {
        const raw = e.target.value;
        setDraft({ base: value, text: raw });
        const parsed = Number(raw);
        if (raw.trim() !== '' && Number.isInteger(parsed)) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
      className={className}
    />
  );
};

/** 🎬 Animated Subtitles — paste caption lines, get timed typewriter-animated text clips. */
const CaptionsCard: React.FC = () => {
  const { playhead, addCaptions, project, selectedClipId, updateClipProperties } = useEditor();
  const [text, setText] = useState<string>('');
  const [secondsPerLine, setSecondsPerLine] = useState<number>(2.5);
  const [newPosition, setNewPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: Math.round(project.height * 0.32),
  });
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const statusTimer = React.useRef<number | null>(null);

  const selectedCaption = project.clips.find(c => c.id === selectedClipId && isCaptionClip(c));
  const captionClips = project.clips.filter(isCaptionClip);

  // While a caption is selected, the controls edit it directly. Otherwise they
  // define the position for the next batch of captions.
  const positionX = selectedCaption ? Math.round(selectedCaption.transform.x) : newPosition.x;
  const positionY = selectedCaption ? Math.round(selectedCaption.transform.y) : newPosition.y;

  const showStatus = (message: string) => {
    const status = document.getElementById('eg-captions-status');
    if (!status) return;
    status.textContent = message;
    status.style.display = 'block';
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => {
      status.style.display = 'none';
    }, 5000);
  };

  const applyPosition = (nextX: number, nextY: number) => {
    if (selectedCaption) {
      updateClipProperties(selectedCaption.id, {
        transform: { ...selectedCaption.transform, x: nextX, y: nextY },
      });
    } else {
      setNewPosition({ x: nextX, y: nextY });
    }
  };

  const verticalPresets = [
    { label: 'Top', y: -Math.round(project.height * 0.32) },
    { label: 'Middle', y: 0 },
    { label: 'Bottom', y: Math.round(project.height * 0.32) },
  ];

  const handleAddCaptions = () => {
    if (lines.length === 0) return;
    addCaptions(lines, playhead, secondsPerLine, { x: positionX, y: positionY });
    showStatus(`✓ ${lines.length} captions added at ${playhead.toFixed(1)}s`);
    setText('');
  };

  const handleApplyToAll = () => {
    if (captionClips.length === 0) return;
    captionClips.forEach(clip => {
      updateClipProperties(clip.id, {
        transform: { ...clip.transform, x: positionX, y: positionY },
      });
    });
    showStatus(`✓ Position applied to ${captionClips.length} captions`);
  };

  return (
    <div className="px-3 py-2 border-b border-[#2b2b2b] bg-gradient-to-r from-[#251f2a] to-[#1e1e1e]">
      <div className="flex items-center space-x-1.5 mb-1">
        <Subtitles className="w-3.5 h-3.5 text-pink-400" />
        <span className="font-semibold text-white text-xs">Animated Captions</span>
      </div>
      <p className="text-[10px] text-gray-500 mb-1">
        One caption per line. Each becomes a timed subtitle clip with a typewriter animation.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        placeholder={"Hello there!\nWelcome to my channel.\nLike and subscribe!"}
        className="w-full bg-[#141414] border border-[#333] rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-600 outline-none focus:border-pink-500 resize-none font-mono"
      />
      <div className="flex items-center space-x-2 mt-1.5">
        <button
          onClick={handleAddCaptions}
          disabled={lines.length === 0}
          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition flex items-center gap-1 ${
            lines.length === 0
              ? 'bg-[#2a2a2a] text-gray-500 border-[#333]'
              : 'bg-pink-600 hover:bg-pink-500 text-white border-pink-400'
          }`}
        >
          <Subtitles className="w-3 h-3" />
          Add {lines.length > 0 ? `${lines.length} Captions` : 'Captions'}
        </button>
        <div className="flex items-center space-x-1">
          <label className="text-[10px] text-gray-400">Sec/line:</label>
          <input
            type="number"
            min={0.5}
            max={10}
            step={0.5}
            value={secondsPerLine}
            onChange={e => setSecondsPerLine(Math.max(0.5, Math.min(10, parseFloat(e.target.value) || 2.5)))}
            className="w-12 bg-[#141414] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono outline-none focus:border-pink-500"
          />
        </div>
      </div>
      {lines.length > 0 && (
        <p className="text-[9px] text-gray-500 mt-1">
          Total: {lines.length * secondsPerLine}s · starts at playhead {playhead.toFixed(1)}s
        </p>
      )}

      {/* Caption position — edits the selected caption live, otherwise sets the position for new captions. */}
      <div className="mt-2 rounded border border-[#333] bg-[#181818]/70 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Move className="w-3 h-3 text-pink-400" />
            Position
          </span>
          <span className="text-[9px] text-gray-500">
            {selectedCaption ? 'selected caption' : 'for new captions'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {verticalPresets.map(preset => {
            const active = Math.abs(positionY - preset.y) <= 2;
            return (
              <button
                key={preset.label}
                onClick={() => applyPosition(positionX, preset.y)}
                title={`Place ${selectedCaption ? 'caption' : 'new captions'} at the ${preset.label.toLowerCase()} of the frame`}
                className={`py-0.5 rounded text-[9px] font-medium border transition ${
                  active
                    ? 'bg-pink-600 border-pink-400 text-white'
                    : 'bg-[#141414] border-[#3a3a3a] text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 w-3">X</span>
            <IntegerField
              value={positionX}
              onChange={nextX => applyPosition(nextX, positionY)}
              className="min-w-0 flex-1 bg-[#141414] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono outline-none focus:border-pink-500"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 w-3">Y</span>
            <IntegerField
              value={positionY}
              onChange={nextY => applyPosition(positionX, nextY)}
              className="min-w-0 flex-1 bg-[#141414] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white font-mono outline-none focus:border-pink-500"
            />
          </label>
        </div>
        {captionClips.length > 0 && (
          <button
            onClick={handleApplyToAll}
            className="w-full py-0.5 rounded text-[9px] font-medium bg-[#2a2230] hover:bg-[#3a2a40] border border-pink-900/60 text-pink-200 transition"
            title="Apply the current X/Y to every caption clip"
          >
            Apply to all captions ({captionClips.length})
          </button>
        )}
        <p className="text-[9px] text-gray-500">
          Tip: drag a caption in the Program Monitor to reposition it.
        </p>
      </div>

      <p id="eg-captions-status" className="hidden mt-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-600/30 text-[10px] text-emerald-300" />
    </div>
  );
};

export const EssentialGraphicsPanel: React.FC = () => {
  const { 
    project, 
    selectedClipId, 
    addTextTitleClip, 
    updateClipProperties,
    clearClipText,
    shapeLayers,
    textAnimations,
    setTextAnimations,
    essentialProperties,
    setEssentialProperties,
    selectedShapeId,
    setSelectedShapeId,
    graphicsTemplates,
    loadGraphicsTemplates,
    addShapeLayer,
    updateShapeLayer,
    deleteShapeLayer,
    addTextAnimation,
    updateTextAnimation,
    addEssentialProperty,
    updateEssentialProperty,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<'browse' | 'edit' | 'shapes' | 'essential' | 'templates' | 'text' | 'animation' | 'responsive'>('browse');
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const [newShapeType, setNewShapeType] = useState<ShapeType>('rectangle');

  const selectedClip = project.clips.find(c => c.id === selectedClipId);
  const textProps: TextProperties = selectedClip?.textProperties || {
    text: 'GRAPHICS TITLE',
    fontFamily: 'Inter',
    fontSize: 64,
    color: '#ffffff',
    align: 'center',
  };

  const clipAnimations = textAnimations;

  const handleUpdateText = useCallback((updates: Partial<TextProperties>) => {
    if (!selectedClipId) return;
    const current = selectedClip?.textProperties || textProps;
    updateClipProperties(selectedClipId, {
      textProperties: { ...current, ...updates },
      name: updates.text ? updates.text.slice(0, 20) : selectedClip?.name
    });
  }, [selectedClipId, selectedClip?.textProperties, textProps, updateClipProperties]);

  const handleAddTemplate = useCallback((tpl: MotionGraphicsTemplate) => {
    if (!selectedClipId) {
      // Create a new title clip first
      addTextTitleClip({
        text: tpl.defaultText,
        fontFamily: tpl.defaultFontFamily,
        fontSize: tpl.defaultFontSize,
        color: tpl.defaultColor,
        backgroundColor: tpl.defaultBackgroundColor ?? undefined,
        align: 'center',
      }, 5.0);
      setActiveTab('edit');
      setTimeout(() => {
        // Apply template properties after clip creation
        const newClip = project.clips.find(c => c.textProperties && c.textProperties.text === tpl.defaultText);
        if (newClip) {
          handleUpdateText({
            fontFamily: tpl.defaultFontFamily,
            fontSize: tpl.defaultFontSize,
            color: tpl.defaultColor,
            backgroundColor: tpl.defaultBackgroundColor ?? undefined,
            text: tpl.defaultText,
          });
          // Add template shapes
          tpl.defaultShapes.forEach(shape => {
            addShapeLayer(shape);
          });
          // Add template animation
          if (tpl.defaultAnimation.enabled) {
            addTextAnimation(tpl.defaultAnimation);
          }
          // Add essential properties
          tpl.essentialProperties.forEach(prop => {
            addEssentialProperty(prop);
          });
        }
      }, 50);
    } else {
      handleUpdateText({
        fontFamily: tpl.defaultFontFamily,
        fontSize: tpl.defaultFontSize,
        color: tpl.defaultColor,
        backgroundColor: tpl.defaultBackgroundColor ?? undefined,
        text: tpl.defaultText,
      });
      tpl.defaultShapes.forEach(shape => addShapeLayer(shape));
      if (tpl.defaultAnimation.enabled) {
        addTextAnimation(tpl.defaultAnimation);
      }
      tpl.essentialProperties.forEach(prop => addEssentialProperty(prop));
    }
    setActiveTab('edit');
  }, [selectedClipId, addTextTitleClip, handleUpdateText, project.clips, addShapeLayer, addTextAnimation, addEssentialProperty]);

  const handleAddShape = useCallback(() => {
    if (!selectedClipId) {
      alert('Select a clip on the timeline first.');
      return;
    }
    const newShape: Omit<ShapeLayer, 'id'> = {
      type: newShapeType,
      x: 0, y: 0, width: 200, height: 100,
      fillColor: '#1473e6', fillOpacity: 1,
      strokeColor: null, strokeWidth: 0,
      cornerRadius: 0, rotation: 0, opacity: 1,
      pin: 'none', pinOffset: { x: 0, y: 0 },
    };
    addShapeLayer(newShape);
  }, [selectedClipId, newShapeType, addShapeLayer]);

  const handleUpdateShape = useCallback((shapeId: string, updates: Partial<ShapeLayer>) => {
    updateShapeLayer(shapeId, updates);
  }, [updateShapeLayer]);

  const handleRemoveShape = useCallback((shapeId: string) => {
    deleteShapeLayer(shapeId);
    setSelectedShapeId(null);
  }, [deleteShapeLayer]);

  const handleUpdateAnimation = useCallback((animId: string, updates: Partial<TextAnimation>) => {
    updateTextAnimation(animId, updates);
  }, [updateTextAnimation]);

  const handleRemoveAnimation = useCallback((animId: string) => {
    setTextAnimations(prev => prev.filter(a => a.id !== animId));
  }, [setTextAnimations]);

  const handleToggleAnimation = useCallback((animId: string) => {
    setTextAnimations(prev => prev.map(a => 
      a.id === animId ? { ...a, enabled: !a.enabled } : a
    ));
  }, [setTextAnimations]);

  const handleUpdateEssentialProp = useCallback((propId: string, value: any) => {
    updateEssentialProperty(propId, value);
  }, [updateEssentialProperty]);

  const SectionHeader: React.FC<{ 
    section: SectionKey; 
    icon: React.ReactNode; 
    label: string; 
  }> = ({ section, icon, label }) => (
    <button
      onClick={() => setActiveTab(section as any)}
      className={`w-full flex items-center justify-between px-3 py-2 bg-[#282828] hover:bg-[#2c2c2c] text-white font-semibold text-left transition ${
        activeTab === section ? 'bg-[#1473e6]' : ''
      }`}
    >
      <span className="flex items-center space-x-1.5">
        <span className="w-3.5 h-3.5">{icon}</span>
        <span className="text-white">{label}</span>
      </span>
      {activeTab === section ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
    </button>
  );

  const filteredTemplates = graphicsTemplates.filter(t => 
    templateCategory === 'all' || t.category === templateCategory
  );

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#2d2d2d] select-none text-xs text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#252525] border-b border-[#2d2d2d]">
        <div className="flex items-center space-x-1">
          <Type className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-white">Essential Graphics</span>
        </div>
        <button
          onClick={loadGraphicsTemplates}
          className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"
          title="Refresh Templates"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <CaptionsCard />

        {!selectedClip ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500 space-y-2">
          <Type className="w-8 h-8 opacity-30" />
          <span className="font-medium text-gray-300">No Clip Selected</span>
          <p className="text-[11px] text-gray-500">Select a clip on the timeline to add graphics.</p>
          <button
            onClick={() => {
              if (!selectedClipId) {
                addTextTitleClip({ text: 'NEW GRAPHIC', fontFamily: 'Inter', fontSize: 64, color: '#ffffff', align: 'center' }, 5.0);
              }
            }}
            className="px-4 py-1.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-medium text-xs shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Graphic Clip</span>
          </button>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {/* 1. Template Browser */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="templates" icon={<Monitor className="w-3.5 h-3.5" />} label="Motion Graphics Templates" />
            {activeTab === 'templates' && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                {/* Category filter */}
                <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setTemplateCategory(cat.id)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition whitespace-nowrap ${
                        templateCategory === cat.id
                          ? 'bg-[#1473e6] text-white border-blue-500'
                          : 'bg-[#181818] border-[#333] text-gray-400 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Template Grid */}
                <div className="grid grid-cols-1 gap-2">
                  {filteredTemplates.map(tpl => (
                    <div
                      key={tpl.id}
                      onClick={() => handleAddTemplate(tpl)}
                      className="bg-[#242424] hover:bg-[#2c2c2c] border border-[#333] hover:border-pink-500 rounded p-3 cursor-pointer transition group"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-white truncate">{tpl.name}</span>
                        <span className="text-[9px] bg-pink-900/40 text-pink-300 px-1.5 py-0.5 rounded font-mono uppercase">
                          {tpl.category}
                        </span>
                      </div>
                      <div className="h-16 rounded bg-[#000] border border-[#444] flex items-center justify-center mb-2 overflow-hidden">
                        <span className="text-[9px] text-gray-400 font-mono">{tpl.defaultText.slice(0, 15)}</span>
                      </div>
                      <p className="text-[9px] text-gray-500 mb-2">{tpl.description}</p>
                      <div className="flex gap-1">
                        {tpl.essentialProperties.slice(0, 3).map(prop => (
                          <span key={prop.id} className="px-1.5 py-0.5 rounded bg-[#181818] border border-[#333] text-[9px] text-gray-300">
                            {prop.name}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddTemplate(tpl); }}
                        className="w-full py-1.5 mt-2 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        <span>Add to Sequence</span>
                      </button>
                    </div>
                  ))}
                  {filteredTemplates.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No templates in this category.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Text Editor */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="text" icon={<Type className="w-3.5 h-3.5" />} label="Text Properties" />
            {activeTab === 'text' && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Text Content</label>
                  <textarea
                    rows={3}
                    value={textProps.text}
                    onChange={e => handleUpdateText({ text: e.target.value })}
                    className="w-full bg-[#181818] border border-[#3a3a3a] rounded p-2 text-white font-sans text-xs focus:border-blue-500 outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Font Family</label>
                    <select
                      value={textProps.fontFamily}
                      onChange={e => handleUpdateText({ fontFamily: e.target.value })}
                      className="w-full bg-[#181818] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500"
                    >
                      <option value="Inter">Inter</option>
                      <option value="Arial">Arial</option>
                      <option value="Impact">Impact</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Size</span>
                      <span className="font-mono text-cyan-400">{textProps.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="18"
                      max="140"
                      value={textProps.fontSize}
                      onChange={e => handleUpdateText({ fontSize: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500 h-1 bg-[#141414] rounded cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Alignment</label>
                  <div className="flex space-x-1">
                    {[
                      { align: 'left' as const, icon: <AlignLeft className="w-3.5 h-3.5" /> },
                      { align: 'center' as const, icon: <AlignCenter className="w-3.5 h-3.5" /> },
                      { align: 'right' as const, icon: <AlignRight className="w-3.5 h-3.5" /> },
                    ].map(a => (
                      <button
                        key={a.align}
                        onClick={() => handleUpdateText({ align: a.align })}
                        className={`flex-1 py-1 rounded flex items-center justify-center border transition ${
                          textProps.align === a.align
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-[#181818] border-[#333] text-gray-400 hover:text-white'
                        }`}
                      >
                        {a.icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#333]">
                  <ColorSwatch value={textProps.color} onChange={v => handleUpdateText({ color: v })} label="Fill" />
                  <ColorSwatch value={textProps.backgroundColor || '#000000'} onChange={v => handleUpdateText({ backgroundColor: v })} label="Bg" />
                </div>
              </div>
            )}
          </div>

          {/* 3. Text Animation */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="animation" icon={<Zap className="w-3.5 h-3.5" />} label="Text Animation" />
            {activeTab === 'animation' && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                {/* Animation Presets */}
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-400 block mb-2">Animation Preset</label>
                  <div className="grid grid-cols-4 gap-1">
                    {ANIMATION_PRESETS.map(preset => {
                      const existing = clipAnimations.find(a => a.type === preset.id);
                      return (
                        <button
                          key={preset.id}
                          onClick={() => {
                            if (existing) {
                              handleToggleAnimation(existing.id);
                            } else {
                              addTextAnimation({
                                type: preset.id,
                                duration: 0.5,
                                easing: 'ease-out',
                                delay: 0,
                                enabled: true,
                              });
                            }
                          }}
                          className={`flex flex-col items-center space-y-1 p-2 rounded border transition ${
                            existing?.enabled
                              ? 'bg-[#1473e6]/30 border-blue-500 text-blue-400'
                              : 'bg-[#181818] border-[#333] text-gray-400 hover:border-gray-500 hover:text-white'
                          }`}
                        >
                          {preset.icon}
                          <span className="text-[9px]">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Animations */}
                <div className="mt-3">
                  <label className="text-[10px] text-gray-400 block mb-2">Active Animations</label>
                  {clipAnimations.length === 0 ? (
                    <div className="text-center py-3 text-gray-500 text-[11px]">
                      No animations added.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {clipAnimations.map(anim => (
                        <div key={anim.id} className="flex items-center justify-between px-2 py-1 bg-[#181818] rounded border border-[#2a2a2a]">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={anim.enabled}
                              onChange={() => handleToggleAnimation(anim.id)}
                              className="accent-blue-500 rounded"
                            />
                            <span className="text-xs text-gray-300">{anim.type}</span>
                            <span className="text-[9px] text-gray-500 font-mono">{anim.duration}s</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <select
                              value={anim.easing}
                              onChange={e => handleUpdateAnimation(anim.id, { easing: e.target.value as EasingType })}
                              className="bg-[#141414] border border-[#333] rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none"
                            >
                              {EASING_OPTIONS.map(e => (
                                <option key={e.id} value={e.id}>{e.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleRemoveAnimation(anim.id)}
                              className="p-1 text-gray-400 hover:text-red-400 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#333]">
                  <SliderRow
                    label="Duration (s)"
                    value={clipAnimations[0]?.duration || 0.5}
                    min={0.1} max={10} step={0.1} unit="s" accentColor="accent-purple-400"
                    onChange={v => {
                      if (clipAnimations[0]) handleUpdateAnimation(clipAnimations[0].id, { duration: v });
                    }}
                  />
                  <SliderRow
                    label="Delay (s)"
                    value={clipAnimations[0]?.delay || 0}
                    min={0} max={5} step={0.1} unit="s" accentColor="accent-purple-400"
                    onChange={v => {
                      if (clipAnimations[0]) handleUpdateAnimation(clipAnimations[0].id, { delay: v });
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. Shape Layers */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="shapes" icon={<Square className="w-3.5 h-3.5" />} label="Shape Layers" />
            {activeTab === 'shapes' && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                {/* Add Shape */}
                <div className="flex items-center space-x-2 mb-3">
                  <select
                    value={newShapeType}
                    onChange={e => setNewShapeType(e.target.value as ShapeType)}
                    className="flex-1 bg-[#181818] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500"
                  >
                    {SHAPE_TYPES.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddShape}
                    disabled={!selectedClipId}
                    className="px-3 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Shape</span>
                  </button>
                </div>

                {/* Shape List */}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {shapeLayers.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-[11px]">
                      No shape layers. Add shapes above.
                    </div>
                  ) : (
                    shapeLayers.map(shape => (
                      <div
                        key={shape.id}
                        onClick={() => setSelectedShapeId(shape.id)}
                        className={`flex items-center justify-between px-2 py-1.5 rounded border cursor-pointer transition ${
                          selectedShapeId === shape.id
                            ? 'bg-[#1473e6]/30 border-blue-500'
                            : 'bg-[#181818] border-[#2a2a2a] hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: shape.fillColor }} />
                          <span className="text-xs text-gray-300 truncate w-20">{shape.type}</span>
                          <span className="text-[9px] text-gray-500 font-mono">{shape.width}x{shape.height}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveShape(shape.id); }}
                          className="p-1 text-gray-400 hover:text-red-400 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Shape Editor */}
                {selectedShapeId && (
                  <div className="mt-3 pt-3 border-t border-[#333]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white">Shape Editor</span>
                      <button
                        onClick={() => setSelectedShapeId(null)}
                        className="p-1 text-gray-400 hover:text-white"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <SliderRow
                        label="X"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.x || 0}
                        min={-1920} max={1920} step={1} unit="px" accentColor="accent-blue-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { x: v });
                        }}
                      />
                      <SliderRow
                        label="Y"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.y || 0}
                        min={-1080} max={1080} step={1} unit="px" accentColor="accent-blue-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { y: v });
                        }}
                      />
                      <SliderRow
                        label="Width"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.width || 200}
                        min={10} max={1920} step={1} unit="px" accentColor="accent-green-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { width: v });
                        }}
                      />
                      <SliderRow
                        label="Height"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.height || 100}
                        min={10} max={1080} step={1} unit="px" accentColor="accent-green-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { height: v });
                        }}
                      />
                      <SliderRow
                        label="Rotation"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.rotation || 0}
                        min={-360} max={360} step={1} unit="°" accentColor="accent-purple-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { rotation: v });
                        }}
                      />
                      <SliderRow
                        label="Opacity"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.opacity || 1}
                        min={0} max={1} step={0.01} unit="" accentColor="accent-gray-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { opacity: v });
                        }}
                      />
                      <ColorSwatch value={shapeLayers.find(s => s.id === selectedShapeId)?.fillColor || '#1473e6'} onChange={v => {
                        const shape = shapeLayers.find(s => s.id === selectedShapeId);
                        if (shape) handleUpdateShape(shape.id, { fillColor: v });
                      }} label="Fill" />
                      <SliderRow
                        label="Corner Radius"
                        value={shapeLayers.find(s => s.id === selectedShapeId)?.cornerRadius || 0}
                        min={0} max={100} step={1} unit="px" accentColor="accent-indigo-400"
                        onChange={v => {
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { cornerRadius: v });
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Responsive Design / Pin */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="responsive" icon={<Pin className="w-3.5 h-3.5" />} label="Responsive Design" />
            {activeTab === 'responsive' && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <label className="text-[10px] text-gray-400 block mb-2">Pin Position</label>
                <div className="grid grid-cols-3 gap-2">
                  {PIN_POSITIONS.map(p => {
                    const shape = shapeLayers.find(s => s.id === selectedShapeId);
                    const isActive = selectedShapeId && shape?.pin === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (!selectedShapeId) return;
                          const shape = shapeLayers.find(s => s.id === selectedShapeId);
                          if (shape) handleUpdateShape(shape.id, { pin: p.id });
                        }}
                        className={`flex flex-col items-center space-y-1 p-2 rounded border transition ${
                          isActive
                            ? 'bg-[#1473e6]/30 border-blue-500 text-blue-400'
                            : 'bg-[#181818] border-[#333] text-gray-400 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {p.icon}
                        <span className="text-[9px]">{p.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#333]">
                  <SliderRow
                    label="Pin Offset X"
                    value={shapeLayers.find(s => s.id === selectedShapeId)?.pinOffset.x || 0}
                    min={-500} max={500} step={1} unit="px" accentColor="accent-blue-400"
                    onChange={v => {
                      const shape = shapeLayers.find(s => s.id === selectedShapeId);
                      if (shape) handleUpdateShape(shape.id, { pinOffset: { ...shape.pinOffset, x: v } });
                    }}
                  />
                  <SliderRow
                    label="Pin Offset Y"
                    value={shapeLayers.find(s => s.id === selectedShapeId)?.pinOffset.y || 0}
                    min={-500} max={500} step={1} unit="px" accentColor="accent-blue-400"
                    onChange={v => {
                      const shape = shapeLayers.find(s => s.id === selectedShapeId);
                      if (shape) handleUpdateShape(shape.id, { pinOffset: { ...shape.pinOffset, y: v } });
                    }}
                  />
                </div>

                <div className="text-[10px] text-gray-500 bg-[#181818] border border-[#2a2a2a] rounded p-2 mt-2">
                  Pinned shapes stay fixed relative to the frame edge when the sequence resolution changes.
                </div>
              </div>
            )}
          </div>

          {/* 6. Essential Properties */}
          <div className="border border-[#2f2f2f] rounded bg-[#222] overflow-hidden">
            <SectionHeader section="essential" icon={<Link2 className="w-3.5 h-3.5" />} label="Essential Properties" />
            {activeTab === 'essential' && (
              <div className="p-3 space-y-3 border-t border-[#2f2f2f]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-medium text-gray-400">Expose to instance</span>
                  <button
                    onClick={() => {
                      // Add a new essential property
                    }}
                    className="px-2 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {essentialProperties.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 text-[11px]">
                      No essential properties. Add controls that can be edited per-clip instance.
                    </div>
                  ) : (
                    essentialProperties.map(prop => (
                      <div key={prop.id} className="bg-[#181818] border border-[#333] rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-white truncate">{prop.name}</span>
                          <span className="text-[9px] text-gray-500">{prop.propertyPath.split('.').slice(-1)[0]}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={String(prop.value)}
                            onChange={e => handleUpdateEssentialProp(prop.id, e.target.value)}
                            className="flex-1 bg-[#141414] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500"
                          />
                          <span className={`text-[9px] ${prop.exposedToInstance ? 'text-emerald-400' : 'text-gray-500'} font-mono`}>
                            {prop.exposedToInstance ? 'EXPOSED' : 'HIDDEN'}
                          </span>
                        </div>
                        <label className="flex items-center space-x-1 pt-1">
                          <input
                            type="checkbox"
                            checked={prop.exposedToInstance}
                            onChange={() => {
                              const p = essentialProperties.find(ep => ep.id === prop.id);
                              if (p) handleUpdateEssentialProp(prop.id, p.value);
                              // Toggle exposed flag
                              setEssentialProperties(prev => prev.map(ep => 
                                ep.id === prop.id ? { ...ep, exposedToInstance: !ep.exposedToInstance } : ep
                              ));
                            }}
                            className="accent-blue-500 rounded"
                          />
                          <span className="text-[10px] text-gray-400">Expose to instance</span>
                        </label>
                      </div>
                    ))
                  )}
                </div>

                <div className="text-[10px] text-gray-500 bg-[#181818] border border-[#2a2a2a] rounded p-2 mt-2">
                  Essential properties let you edit text, colors, and other values per-clip instance without changing the master template.
                </div>

                {selectedClip?.textProperties && (
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        if (!selectedClipId) return;
                        clearClipText(selectedClipId);
                      }}
                      className="w-full px-2 py-1.5 rounded text-[10px] font-semibold bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-200 hover:text-red-100 flex items-center justify-center gap-1"
                      title="Remove the applied graphic/text from the selected clip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Graphic/Text from Clip
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
