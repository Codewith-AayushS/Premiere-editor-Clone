import React from 'react';
import { useEditor } from '../context/EditorContext';
import type { ActiveTool } from '../types/editor';
import { 
  MousePointer, 
  ChevronsRight, 
  MoveHorizontal, 
  Scissors, 
  Layers, 
  PenTool, 
  Hand, 
  Type, 
  Magnet,
  Undo2,
  Redo2,
  Smartphone,
  RotateCcw
} from 'lucide-react';

export const TimelineToolbar: React.FC = () => {
  const { 
    activeTool, 
    setActiveTool, 
    snappingEnabled, 
    setSnappingEnabled,
    undo,
    redo,
    canUndo,
    canRedo,
    convertToShort,
    removeShortFormat,
    isShortFormat,
  } = useEditor();

  const tools: { id: ActiveTool; label: string; shortcut: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Selection Tool', shortcut: 'V', icon: <MousePointer className="w-4 h-4" /> },
    { id: 'trackSelect', label: 'Track Select Forward', shortcut: 'A', icon: <ChevronsRight className="w-4 h-4" /> },
    { id: 'ripple', label: 'Ripple Edit Tool', shortcut: 'B', icon: <MoveHorizontal className="w-4 h-4" /> },
    { id: 'razor', label: 'Razor Tool (Cut)', shortcut: 'C', icon: <Scissors className="w-4 h-4" /> },
    { id: 'slip', label: 'Slip Tool', shortcut: 'Y', icon: <Layers className="w-4 h-4" /> },
    { id: 'pen', label: 'Pen Tool', shortcut: 'P', icon: <PenTool className="w-4 h-4" /> },
    { id: 'hand', label: 'Hand Tool (Pan)', shortcut: 'H', icon: <Hand className="w-4 h-4" /> },
    { id: 'type', label: 'Type Tool', shortcut: 'T', icon: <Type className="w-4 h-4" /> },
  ];

  return (
    <div className="w-10 h-full bg-[#1e1e1e] border-r border-[#2d2d2d] flex flex-col items-center py-2 space-y-1 select-none z-20">
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          className={`w-7 h-7 flex items-center justify-center rounded transition ${
            activeTool === tool.id
              ? 'bg-[#1473e6] text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#282828]'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="w-5 h-px bg-[#333333] my-1" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={`w-7 h-7 flex items-center justify-center rounded transition ${
          canUndo
            ? 'text-gray-300 hover:text-white hover:bg-[#282828]'
            : 'text-gray-600 cursor-not-allowed'
        }`}
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className={`w-7 h-7 flex items-center justify-center rounded transition ${
          canRedo
            ? 'text-gray-300 hover:text-white hover:bg-[#282828]'
            : 'text-gray-600 cursor-not-allowed'
        }`}
      >
        <Redo2 className="w-4 h-4" />
      </button>

      <div className="w-5 h-px bg-[#333333] my-1" />

      {/* AI Convert to Vertical Short (9:16) */}
      <button
        onClick={convertToShort}
        title={isShortFormat
          ? 'Short format (9:16) is active — click to re-fit all clips to the vertical frame'
          : 'AI: Convert to Short (9:16) — converts the sequence to vertical format and auto-zooms footage cover-fit'}
        className={`w-7 h-7 flex items-center justify-center rounded transition ${
          isShortFormat
            ? 'bg-pink-600/30 text-pink-300 border border-pink-500/50 hover:bg-pink-600/50'
            : 'text-pink-400 hover:text-white hover:bg-pink-600/60'
        }`}
      >
        <Smartphone className="w-4 h-4" />
      </button>

      {/* Remove the 9:16 conversion and restore original framing */}
      {isShortFormat && (
        <button
          onClick={removeShortFormat}
          title="Remove Short Format — restores the original sequence size and clip framing"
          className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:text-white hover:bg-red-600/60 transition"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}

      {/* Magnetic Snapping Toggle */}
      <button
        onClick={() => setSnappingEnabled(prev => !prev)}
        title={`Magnetic Snapping: ${snappingEnabled ? 'ON' : 'OFF'} (S)`}
        className={`w-7 h-7 flex items-center justify-center rounded transition ${
          snappingEnabled
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
            : 'text-gray-500 hover:text-gray-300 hover:bg-[#282828]'
        }`}
      >
        <Magnet className="w-4 h-4" />
      </button>
    </div>
  );
};
