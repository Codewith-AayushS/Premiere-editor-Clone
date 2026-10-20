import React, { useEffect, useState } from 'react';
import { EditorProvider, useEditor } from './context/EditorContext';
import { TopMenuBar } from './components/TopMenuBar';
import { SourceMonitor } from './components/SourceMonitor';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AudioVUMeter } from './components/AudioVUMeter';
import { ProjectBin } from './components/ProjectBin';
import { TimelineToolbar } from './components/TimelineToolbar';
import { MultitrackTimeline } from './components/MultitrackTimeline';
import { ExportModal } from './components/ExportModal';
import { NewProjectModal, OpenProjectModal } from './components/ProjectModals';
import { EffectControls } from './components/EffectControls';

// Workspace Specialized Panels
import { LumetriColorPanel } from './components/workspaces/LumetriColorPanel';
import { EffectsLibraryPanel } from './components/workspaces/EffectsLibraryPanel';
import { AudioMixerPanel } from './components/workspaces/AudioMixerPanel';
import { EssentialGraphicsPanel } from './components/workspaces/EssentialGraphicsPanel';

const SHORTCUTS = [
  { key: 'Space', action: 'Play / Pause' },
  { key: 'V', action: 'Selection Tool' },
  { key: 'C', action: 'Razor Tool (Cut)' },
  { key: 'B', action: 'Ripple Edit Tool' },
  { key: 'S', action: 'Toggle Magnetic Snapping' },
  { key: 'M', action: 'Add Marker at Playhead' },
  { key: 'Ctrl+K', action: 'Split Clip at Playhead' },
  { key: 'Del', action: 'Delete Selected Clip(s)' },
  { key: 'Ctrl+A', action: 'Select All Clips (or drag a box on empty timeline)' },
  { key: 'Shift+Del', action: 'Ripple Delete' },
  { key: 'Ctrl+S', action: 'Save Project (.prproj.json)' },
  { key: 'Ctrl+O', action: 'Open Saved Project' },
  { key: 'Ctrl+N', action: 'New Sequence' },
  { key: 'Ctrl+M', action: 'Export MP4 (FFmpeg)' },
  { key: '← / →', action: 'Step Back / Forward 1 Frame' },
  { key: 'I / O', action: 'Mark In / Mark Out (Source)' },
  { key: '?', action: 'Toggle Keyboard Shortcuts' },
  { key: 'Esc', action: 'Close Menus / Deselect' },
];

const KeyboardShortcutsOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4"
    onClick={onClose}
  >
    <div
      className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2d2d2d]">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 bg-[#00003b] border border-[#7e5bef] rounded flex items-center justify-center font-bold text-[#9d77f3] text-[10px]">
            Pr
          </div>
          <span className="font-semibold text-white text-sm">Keyboard Shortcuts</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-[#333]">
          Close (Esc / ?)
        </button>
      </div>
      <div className="p-4 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-1 gap-1">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between py-1 border-b border-[#252525]">
              <span className="text-gray-300 text-xs">{s.action}</span>
              <kbd className="bg-[#141414] border border-[#3a3a3a] rounded px-2 py-0.5 font-mono text-[11px] text-cyan-300">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const EditorLayout: React.FC = () => {
  const { 
    project,
    playhead,
    togglePlay, 
    saveProject, 
    activeWorkspace,
    selectedClipId,
    setSelectedClipId,
    undo,
    redo,
    setIsExportModalOpen, 
    setIsNewProjectModalOpen, 
    setIsOpenProjectModalOpen,
    setActiveTool,
    setSnappingEnabled
  } = useEditor();

  // In the editing workspace, left panel can toggle between Source Monitor and Effect Controls
  const [leftPanel, setLeftPanel] = useState<'source' | 'effectControls'>('source');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Switch to effect controls when a clip is selected in Editing workspace
  useEffect(() => {
    if (activeWorkspace === 'editing' && selectedClipId) {
      // Don't auto-switch - let user control it via tab
    }
  }, [selectedClipId, activeWorkspace]);

  // Keep clip selection consistent across workspaces: entering Color / Audio /
  // Graphics with no active selection adopts the clip under the playhead
  // (topmost video track wins) so every panel targets the same clip.
  useEffect(() => {
    if (activeWorkspace === 'editing' || activeWorkspace === 'effects') return;
    if (selectedClipId && project.clips.some(c => c.id === selectedClipId)) return;
    const underPlayhead = project.clips
      .filter(c =>
        (c.type === 'video' || c.type === 'image') &&
        !c.textProperties &&
        playhead >= c.startTime && playhead < c.startTime + c.duration)
      .sort((a, b) =>
        parseInt(b.trackId.replace(/\D/g, '') || '0', 10) - parseInt(a.trackId.replace(/\D/g, '') || '0', 10));
    if (underPlayhead[0]) setSelectedClipId(underPlayhead[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace]);

  // Global Premiere Pro Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      // Play / Pause (Space)
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      // Save Project (Ctrl+S)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveProject();
      }
      // Undo (Ctrl+Z) / Redo (Ctrl+Shift+Z or Ctrl+Y)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Export Media (Ctrl+M)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setIsExportModalOpen(true);
      }
      // Open Project (Ctrl+O)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setIsOpenProjectModalOpen(true);
      }
      // New Project (Ctrl+N)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setIsNewProjectModalOpen(true);
      }
      // Keyboard shortcuts overlay
      else if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
      // Tools
      else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'c' || e.key === 'C') {
        setActiveTool('razor');
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('ripple');
      } else if (e.key === 's' || e.key === 'S') {
        // Only toggle snapping if no modifier key
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          setSnappingEnabled(p => !p);
        }
      } else if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    togglePlay,
    saveProject,
    undo,
    redo,
    setIsExportModalOpen, 
    setIsNewProjectModalOpen, 
    setIsOpenProjectModalOpen,
    setActiveTool,
    setSnappingEnabled
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#141414] text-white">
      {/* 1. Top Ribbon Menu & Workspace Tabs */}
      <TopMenuBar />

      {/* 2. Dynamic Workspace Morphing */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* UPPER HALF */}
        <div className="h-[48%] flex border-b border-[#2d2d2d] overflow-hidden">
          {activeWorkspace === 'color' ? (
            /* COLOR WORKSPACE: Program Monitor + Lumetri Color Panel */
            <>
              <div className="flex-1 h-full flex">
                <div className="flex-1 h-full">
                  <ProgramMonitor />
                </div>
                <AudioVUMeter />
              </div>
              <div className="w-[380px] h-full shrink-0">
                <LumetriColorPanel />
              </div>
            </>
          ) : activeWorkspace === 'audio' ? (
            /* AUDIO WORKSPACE: Program Monitor + Audio Track Mixer */
            <>
              <div className="w-[38%] h-full">
                <ProgramMonitor />
              </div>
              <div className="flex-1 h-full">
                <AudioMixerPanel />
              </div>
              <AudioVUMeter />
            </>
          ) : activeWorkspace === 'graphics' ? (
            /* GRAPHICS WORKSPACE: Program Monitor + Essential Graphics */
            <>
              <div className="flex-1 h-full flex">
                <div className="flex-1 h-full">
                  <ProgramMonitor />
                </div>
                <AudioVUMeter />
              </div>
              <div className="w-[380px] h-full shrink-0">
                <EssentialGraphicsPanel />
              </div>
            </>
          ) : (
            /* EDITING / EFFECTS DEFAULT WORKSPACE: Source Monitor (or Effect Controls) + Program Monitor */
            <>
              <div className="w-[45%] h-full flex flex-col">
                {/* Tab strip to toggle Source Monitor vs Effect Controls */}
                <div className="flex h-7 bg-[#252525] border-b border-[#2d2d2d] text-xs shrink-0">
                  <button
                    onClick={() => setLeftPanel('source')}
                    className={`px-3 h-full font-medium border-b-2 transition ${
                      leftPanel === 'source'
                        ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    Source Monitor
                  </button>
                  <button
                    onClick={() => setLeftPanel('effectControls')}
                    className={`px-3 h-full font-medium border-b-2 transition ${
                      leftPanel === 'effectControls'
                        ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    Effect Controls
                    {selectedClipId && (
                      <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                    )}
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {leftPanel === 'source' ? <SourceMonitor /> : <EffectControls />}
                </div>
              </div>
              <div className="flex-1 h-full flex">
                <div className="flex-1 h-full">
                  <ProgramMonitor />
                </div>
                <AudioVUMeter />
              </div>
            </>
          )}
        </div>

        {/* LOWER HALF */}
        <div className="flex-1 flex overflow-hidden">
          {/* Project Media Bin */}
          <div className="w-72 h-full shrink-0">
            <ProjectBin />
          </div>

          {/* If in EFFECTS workspace, open Effects Library panel beside Project Bin */}
          {activeWorkspace === 'effects' && (
            <div className="w-[340px] h-full shrink-0">
              <EffectsLibraryPanel />
            </div>
          )}

          {/* Vertical Tool Strip */}
          <TimelineToolbar />

          {/* Multitrack Sequence Timeline */}
          <div className="flex-1 h-full overflow-hidden">
            <MultitrackTimeline />
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-5 bg-[#161616] border-t border-[#2a2a2a] px-3 flex items-center justify-between text-[10px] text-gray-500 select-none shrink-0">
        <span className="font-mono">
          Adobe Premiere Pro Clone · FFmpeg Render Engine · React 19 + TypeScript
        </span>
        <span className="text-gray-600">
          Press <kbd className="bg-[#1a1a1a] border border-[#333] rounded px-1 font-mono text-[9px] text-gray-400">?</kbd> for keyboard shortcuts
        </span>
      </div>

      {/* Modals */}
      <ExportModal />
      <NewProjectModal />
      <OpenProjectModal />

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && <KeyboardShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  );
};

export function App() {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
}

export default App;
