import React, { useState } from 'react';
import { useEditor } from '../context/EditorContext';
import { 
  Save, 
  FolderOpen, 
  FilePlus, 
  Download, 
  Scissors,
  Trash2,
  Clock,
  Plus,
  Minus,
  Eye,
  Maximize,
  Settings,
  HelpCircle,
  BookOpen,
  GitBranch,
  RefreshCw,
  Link,
  Film,
  Music,
  ArrowRight,
  ArrowLeft,
  Sliders,
} from 'lucide-react';
import type { WorkspaceTab } from '../types/editor';

const workspaces: { id: WorkspaceTab; label: string }[] = [
  { id: 'editing', label: 'Editing' },
  { id: 'color', label: 'Color' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio', label: 'Audio' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'export', label: 'Export' }
];

type MenuKey = 'file' | 'edit' | 'clip' | 'sequence' | 'markers' | 'view' | 'window' | 'help';

export const TopMenuBar: React.FC = () => {
  const {
    project,
    activeWorkspace,
    setActiveWorkspace,
    setIsExportModalOpen,
    setIsNewProjectModalOpen,
    setIsOpenProjectModalOpen,
    saveProject,
    hasUnsavedChanges,
    splitAtPlayhead,
    deleteClip,
    selectedClipId,
    markers,
    addMarker,
    clearMarkers,
    viewSettings,
    updateViewSetting,
    panelVisibility,
    togglePanel,
    setPanels,
    toggleFullscreen,
    setZoom,
    goToNextMarker,
    goToPreviousMarker,
    playhead,
  } = useEditor() as any;

  const [activeMenu, setActiveMenu] = useState<MenuKey | null>(null);

  const handleMenuClick = (menu: MenuKey) => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const closeMenu = () => setActiveMenu(null);

  const handleSpeedDuration = () => {
    if (!selectedClipId) {
      alert('Please select a clip on the timeline first.');
      return;
    }
    const speed = prompt('Enter speed multiplier (1.0 = 100%):', '1.0');
    if (speed !== null) {
      const s = parseFloat(speed);
      if (!isNaN(s) && s > 0) {
        // Speed/duration applied via context
        (window as any)._setClipSpeed?.(selectedClipId, s);
        closeMenu();
      }
    }
  };

  const handleAddTrack = (type: 'video' | 'audio') => {
    // placeholder: context will handle track addition
    closeMenu();
    alert(`Add ${type.toUpperCase()} track coming in next build.`);
  };

  const handleSequenceSettings = () => {
    const width = prompt('Sequence width (px):', String(project.width));
    if (width === null) return;
    const height = prompt('Sequence height (px):', String(project.height));
    if (height === null) return;
    const fps = prompt('Frame rate (fps):', String(project.fps));
    if (fps === null) return;
    closeMenu();
    // Settings applied via context in next phase
    console.log('Sequence settings:', { width: parseInt(width), height: parseInt(height), fps: parseInt(fps) });
  };

  const handleMarkerColor = (color: string) => {
    const time = playhead;
    const label = prompt('Marker label:', `Marker ${markers.length + 1}`);
    if (label !== null) {
      addMarker(time, label, color);
    }
    closeMenu();
  };

  return (
    <div className="flex flex-col bg-[#1e1e1e] border-b border-[#2d2d2d] select-none text-xs text-[#dcdcdc] z-50">
      {/* Top Application Ribbon */}
      <div className="flex items-center justify-between px-3 h-8 bg-[#181818] border-b border-[#272727]">
        {/* Left: Adobe Pr Badge and Native Menus */}
        <div className="flex items-center space-x-1">
          <div className="flex items-center justify-center w-6 h-6 bg-[#00003b] border border-[#7e5bef] rounded font-bold text-[#9d77f3] text-xs mr-2 shadow-sm tracking-tighter">
            Pr
          </div>

          {/* File Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('file')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'file' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              File
            </button>
            {activeMenu === 'file' && (
              <div 
                className="absolute left-0 mt-1 w-56 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <button 
                  onClick={() => { closeMenu(); setIsNewProjectModalOpen(true); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><FilePlus className="w-3.5 h-3.5 mr-2" /> New Project...</span>
                  <span className="text-gray-400">Ctrl+N</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); setIsOpenProjectModalOpen(true); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><FolderOpen className="w-3.5 h-3.5 mr-2" /> Open Project...</span>
                  <span className="text-gray-400">Ctrl+O</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { closeMenu(); saveProject(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Save className="w-3.5 h-3.5 mr-2" /> Save Project</span>
                  <span className="text-gray-400">Ctrl+S</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); saveProject(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span>Save As...</span>
                  <span className="text-gray-400">Ctrl+Shift+S</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { closeMenu(); setIsExportModalOpen(true); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between text-yellow-300 hover:text-white"
                >
                  <span className="flex items-center"><Download className="w-3.5 h-3.5 mr-2" /> Export Media (FFmpeg)...</span>
                  <span>Ctrl+M</span>
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('edit')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'edit' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              Edit
            </button>
            {activeMenu === 'edit' && (
              <div 
                className="absolute left-0 mt-1 w-52 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <button 
                  onClick={() => { closeMenu(); splitAtPlayhead(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Scissors className="w-3.5 h-3.5 mr-2" /> Split at Playhead</span>
                  <span className="text-gray-400">Ctrl+K</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); if (selectedClipId) deleteClip(selectedClipId, false); }}
                  disabled={!selectedClipId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span>Delete Selected</span>
                  <span className="text-gray-400">Del</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); if (selectedClipId) deleteClip(selectedClipId, true); }}
                  disabled={!selectedClipId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span>Ripple Delete</span>
                  <span className="text-gray-400">Shift+Del</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={handleSpeedDuration}
                  disabled={!selectedClipId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-2" /> Speed/Duration...</span>
                  <span className="text-gray-400">Ctrl+R</span>
                </button>
              </div>
            )}
          </div>

          {/* Clip Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('clip')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'clip' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              Clip
            </button>
            {activeMenu === 'clip' && (
              <div 
                className="absolute left-0 mt-1 w-56 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <button 
                  onClick={() => { closeMenu(); splitAtPlayhead(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Scissors className="w-3.5 h-3.5 mr-2" /> Split at Playhead</span>
                  <span className="text-gray-400">Ctrl+K</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { closeMenu(); if (selectedClipId) deleteClip(selectedClipId, false); }}
                  disabled={!selectedClipId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span className="flex items-center"><Trash2 className="w-3.5 h-3.5 mr-2" /> Clear/Delete</span>
                  <span className="text-gray-400">Del</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); if (selectedClipId) deleteClip(selectedClipId, true); }}
                  disabled={!selectedClipId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span className="flex items-center"><Trash2 className="w-3.5 h-3.5 mr-2" /> Ripple Delete</span>
                  <span className="text-gray-400">Shift+Del</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={handleSpeedDuration}
                  disabled={!selectedClipId}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-2" /> Speed/Duration...</span>
                  <span className="text-gray-400">Ctrl+R</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Eye className="w-3.5 h-3.5 mr-2" /> Enable/Disable Clip</span>
                </button>
              </div>
            )}
          </div>

          {/* Sequence Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('sequence')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'sequence' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              Sequence
            </button>
            {activeMenu === 'sequence' && (
              <div 
                className="absolute left-0 mt-1 w-60 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <button 
                  onClick={() => { closeMenu(); setIsNewProjectModalOpen(true); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><FilePlus className="w-3.5 h-3.5 mr-2" /> New Sequence...</span>
                  <span className="text-gray-400">Ctrl+N</span>
                </button>
                <button 
                  onClick={handleSequenceSettings}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Settings className="w-3.5 h-3.5 mr-2" /> Sequence Settings...</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { handleAddTrack('video'); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Film className="w-3.5 h-3.5 mr-2 text-blue-400" /> Add Video Track</span>
                </button>
                <button 
                  onClick={() => { handleAddTrack('audio'); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Music className="w-3.5 h-3.5 mr-2 text-emerald-400" /> Add Audio Track</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between text-gray-400"
                >
                  <span className="flex items-center"><Minus className="w-3.5 h-3.5 mr-2" /> Remove Track</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Link className="w-3.5 h-3.5 mr-2" /> Nest Clips...</span>
                </button>
              </div>
            )}
          </div>

          {/* Markers Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('markers')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'markers' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              Markers
            </button>
            {activeMenu === 'markers' && (
              <div 
                className="absolute left-0 mt-1 w-56 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <button 
                  onClick={() => { handleMarkerColor('#f1c40f'); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Plus className="w-3.5 h-3.5 mr-2" /> Add Marker at Playhead</span>
                  <span className="text-gray-400">M</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); }}
                  disabled={markers.length === 0}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] disabled:opacity-40 flex items-center justify-between"
                >
                  <span className="flex items-center"><Sliders className="w-3.5 h-3.5 mr-2" /> Edit Selected Marker</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { goToNextMarker(); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><ArrowRight className="w-3.5 h-3.5 mr-2" /> Go to Next Marker</span>
                </button>
                <button 
                  onClick={() => { goToPreviousMarker(); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><ArrowLeft className="w-3.5 h-3.5 mr-2" /> Go to Previous Marker</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { clearMarkers(); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between text-rose-400"
                >
                  <span className="flex items-center"><Trash2 className="w-3.5 h-3.5 mr-2" /> Clear All Markers</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <div className="px-3 py-1.5 text-[10px] text-gray-500 font-mono uppercase">Marker Colors</div>
                <div className="grid grid-cols-3 gap-1 p-2">
                  {['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'].map(color => (
                    <button
                      key={color}
                      onClick={() => { handleMarkerColor(color); }}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-xs transition ${
                        color === '#f1c40f' ? 'bg-[#1473e6] text-white' : 'bg-[#181818] border border-[#333] text-gray-300 hover:text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{color}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('view')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'view' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div 
                className="absolute left-0 mt-1 w-52 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase border-b border-[#333] mb-1">Zoom</div>
                <button 
                  onClick={() => { setZoom(60); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span>Zoom Fit</span>
                </button>
                <button 
                  onClick={() => { setZoom(100); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span>100%</span>
                </button>
                <button 
                  onClick={() => { setZoom(200); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span>200%</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase border-b border-[#333] mb-1">Overlays</div>
                <button 
                  onClick={() => { updateViewSetting('safeMargins', !viewSettings.safeMargins); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${viewSettings.safeMargins ? 'text-emerald-400' : ''}`}
                >
                  <span>Safe Margins</span>
                  <span className={`ml-auto text-[10px] ${viewSettings.safeMargins ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {viewSettings.safeMargins ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button 
                  onClick={() => { updateViewSetting('rulers', !viewSettings.rulers); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${viewSettings.rulers ? 'text-emerald-400' : ''}`}
                >
                  <span>Rulers</span>
                  <span className={`ml-auto text-[10px] ${viewSettings.rulers ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {viewSettings.rulers ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button 
                  onClick={() => { updateViewSetting('guides', !viewSettings.guides); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${viewSettings.guides ? 'text-emerald-400' : ''}`}
                >
                  <span>Guides</span>
                  <span className={`ml-auto text-[10px] ${viewSettings.guides ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {viewSettings.guides ? 'ON' : 'OFF'}
                  </span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase border-b border-[#333] mb-1">Display</div>
                <button 
                  onClick={() => { toggleFullscreen(); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><Maximize className="w-3.5 h-3.5 mr-2" /> Full Screen</span>
                  <span className="text-gray-400">F11</span>
                </button>
                <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase border-b border-[#333] mb-1">Playback Resolution</div>
                <button 
                  onClick={() => { updateViewSetting('playbackRes', 'Full'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${viewSettings.playbackRes === 'Full' ? 'bg-[#1473e6] text-white' : ''}`}
                >
                  <span>Full</span>
                </button>
                <button 
                  onClick={() => { updateViewSetting('playbackRes', '1/2'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${viewSettings.playbackRes === '1/2' ? 'bg-[#1473e6] text-white' : ''}`}
                >
                  <span>1/2</span>
                </button>
                <button 
                  onClick={() => { updateViewSetting('playbackRes', '1/4'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${viewSettings.playbackRes === '1/4' ? 'bg-[#1473e6] text-white' : ''}`}
                >
                  <span>1/4</span>
                </button>
              </div>
            )}
          </div>

          {/* Window Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('window')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'window' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              Window
            </button>
            {activeMenu === 'window' && (
              <div 
                className="absolute left-0 mt-1 w-56 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase border-b border-[#333] mb-1">Panels</div>
                <button 
                  onClick={() => { togglePanel('source'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.source ? 'text-emerald-400' : ''}`}
                >
                  <span>Source Monitor</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.source ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.source ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('program'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.program ? 'text-emerald-400' : ''}`}
                >
                  <span>Program Monitor</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.program ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.program ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('effectControls'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.effectControls ? 'text-emerald-400' : ''}`}
                >
                  <span>Effect Controls</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.effectControls ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.effectControls ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('projectBin'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.projectBin ? 'text-emerald-400' : ''}`}
                >
                  <span>Project Media Bin</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.projectBin ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.projectBin ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('audioMixer'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.audioMixer ? 'text-emerald-400' : ''}`}
                >
                  <span>Audio Track Mixer</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.audioMixer ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.audioMixer ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('lumetriColor'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.lumetriColor ? 'text-emerald-400' : ''}`}
                >
                  <span>Lumetri Color</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.lumetriColor ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.lumetriColor ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('effectsLibrary'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.effectsLibrary ? 'text-emerald-400' : ''}`}
                >
                  <span>Effects Library</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.effectsLibrary ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.effectsLibrary ? '✓' : ''}</span>
                </button>
                <button 
                  onClick={() => { togglePanel('essentialGraphics'); closeMenu(); }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${panelVisibility.essentialGraphics ? 'text-emerald-400' : ''}`}
                >
                  <span>Essential Graphics</span>
                  <span className={`ml-auto text-[10px] ${panelVisibility.essentialGraphics ? 'text-emerald-400' : 'text-gray-500'}`}>{panelVisibility.essentialGraphics ? '✓' : ''}</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase border-b border-[#333] mb-1">Workspaces</div>
                {workspaces.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'export') { setIsExportModalOpen(true); } else { setActiveWorkspace(tab.id); }
                      closeMenu();
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between ${activeWorkspace === tab.id ? 'bg-[#1473e6] text-white' : ''}`}
                  >
                    <span>{tab.label}</span>
                    <span className={`ml-auto text-[10px] ${activeWorkspace === tab.id ? 'text-white' : 'text-gray-500'}`}>
                      {activeWorkspace === tab.id ? '●' : ''}
                    </span>
                  </button>
                ))}
                <button 
                  onClick={() => { setPanels({ source: true, program: true, effectControls: true, projectBin: true, audioMixer: true, lumetriColor: true, effectsLibrary: true, essentialGraphics: true }); closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between text-gray-400"
                >
                  <span>Reset Workspace</span>
                </button>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div className="relative">
            <button 
              onClick={() => handleMenuClick('help')} 
              className={`px-2.5 py-1 rounded hover:bg-[#2e2e2e] ${activeMenu === 'help' ? 'bg-[#2e2e2e] text-white' : ''}`}
            >
              Help
            </button>
            {activeMenu === 'help' && (
              <div 
                className="absolute left-0 mt-1 w-52 bg-[#252525] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 text-xs"
                onMouseLeave={closeMenu}
              >
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><HelpCircle className="w-3.5 h-3.5 mr-2" /> Keyboard Shortcuts</span>
                  <span className="text-gray-400">?</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><BookOpen className="w-3.5 h-3.5 mr-2" /> User Guide</span>
                </button>
                <div className="h-px bg-[#383838] my-1" />
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><GitBranch className="w-3.5 h-3.5 mr-2" /> About Premiere Pro Clone</span>
                </button>
                <button 
                  onClick={() => { closeMenu(); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#1473e6] flex items-center justify-between"
                >
                  <span className="flex items-center"><RefreshCw className="w-3.5 h-3.5 mr-2" /> Check for Updates</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center: Current Project Name */}
        <div className="flex items-center space-x-2">
          <span className="text-gray-400 font-mono text-[11px] bg-[#141414] px-2 py-0.5 rounded border border-[#2b2b2b]">
            {project.name}.prproj {hasUnsavedChanges ? '*' : ''}
          </span>
          <span className="text-[10px] text-gray-500">
            {project.width}x{project.height} @ {project.fps}fps
          </span>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => saveProject()}
            title="Save Project (Ctrl+S)"
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#282828] hover:bg-[#333333] border border-[#3e3e3e] rounded text-gray-200 transition"
          >
            <Save className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px]">Save</span>
          </button>
          
          <button
            onClick={() => setIsExportModalOpen(true)}
            title="Export MP4 Video (Ctrl+M)"
            className="flex items-center space-x-1.5 px-3 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-medium shadow transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="text-[11px]">Export Video</span>
          </button>
        </div>
      </div>

      {/* Workspace Tabs Bar */}
      <div className="flex items-center justify-between px-3 h-7 bg-[#202020] border-b border-[#2b2b2b]">
        <div className="flex items-center space-x-1 h-full">
          {workspaces.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'export') {
                  setIsExportModalOpen(true);
                } else {
                  setActiveWorkspace(tab.id);
                }
              }}
              className={`h-full px-3 text-[11px] font-medium flex items-center transition border-b-2 ${
                activeWorkspace === tab.id
                  ? 'border-[#1473e6] text-white bg-[#282828]'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#252525]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center text-[10px] text-gray-400 space-x-3">
          <span>Adobe Premiere Pro Engine</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span className="text-emerald-400 font-mono">FFmpeg 9.0 Active</span>
        </div>
      </div>
    </div>
  );
};
