import React, { useState, useRef } from 'react';
import { useEditor } from '../context/EditorContext';
import type { MediaAsset } from '../types/editor';
import { formatDuration } from '../utils/timecode';
import { 
  Folder, 
  Upload, 
  Film, 
  Music, 
  Image as ImageIcon, 
  Search, 
  Grid, 
  List
} from 'lucide-react';

export const ProjectBin: React.FC = () => {
  const { 
    project, 
    setSourceAsset, 
    uploadFiles, 
    addClipToTimeline, 
    playhead,
    proxyInfo,
    updateProxyInfo,
  } = useEditor();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredAssets = project.assets.filter(asset =>
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleDragStart = (e: React.DragEvent, asset: MediaAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div 
      className={`flex flex-col h-full bg-[#1e1e1e] border-r border-[#2d2d2d] select-none text-xs transition ${
        isDraggingOver ? 'bg-[#252830] ring-2 ring-blue-500' : ''
      }`}
      onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Bin Header Tab Bar */}
      <div className="flex items-center justify-between px-3 h-7 bg-[#252525] border-b border-[#2d2d2d]">
        <div className="flex items-center space-x-2">
          <Folder className="w-3.5 h-3.5 text-yellow-400" />
          <span className="font-semibold text-white">Project: {project.name}</span>
          <span className="text-[10px] text-gray-500">({project.assets.length} items)</span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setViewMode('grid')}
            title="Icon View"
            className={`p-1 rounded ${viewMode === 'grid' ? 'bg-[#1473e6] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="List View"
            className={`p-1 rounded ${viewMode === 'list' ? 'bg-[#1473e6] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bin Toolbar: Search and Import */}
      <div className="flex items-center space-x-2 px-3 py-1.5 bg-[#202020] border-b border-[#2b2b2b]">
        <div className="flex-1 relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search media..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#141414] border border-[#333] rounded pl-7 pr-2 py-0.5 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          title="Import Media (Ctrl+I)"
          className="flex items-center space-x-1 px-2.5 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-medium shadow transition text-[11px]"
        >
          <Upload className="w-3 h-3" />
          <span>Import</span>
        </button>
      </div>

      {/* Assets Grid / List View */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredAssets.length === 0 ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-[#3a3a3a] rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition group"
          >
            <Upload className="w-8 h-8 text-gray-500 group-hover:text-blue-400 mb-2 transition" />
            <p className="text-gray-300 font-medium">Drop media files here</p>
            <p className="text-gray-500 text-[11px] mt-1">or click to browse videos, audio, and images</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map(asset => (
              <div
                key={asset.id}
                draggable
                onDragStart={e => handleDragStart(e, asset)}
                onDoubleClick={() => setSourceAsset(asset)}
                className="bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] hover:border-blue-500 rounded p-1.5 flex flex-col cursor-pointer transition group shadow-sm"
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-video bg-[#141414] rounded overflow-hidden flex items-center justify-center">
                  {asset.thumbnail ? (
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  ) : asset.type === 'image' ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center text-gray-500">
                      {asset.type === 'audio' ? (
                        <Music className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <Film className="w-6 h-6 text-blue-400" />
                      )}
                    </div>
                  )}

                  {/* Duration badge */}
                  <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.2 rounded font-mono text-[9px] text-gray-300">
                    {formatDuration(asset.duration)}
                  </div>

                  {/* Type badge */}
                  <div className="absolute top-1 left-1">
                    {asset.type === 'video' && <span className="bg-blue-600/90 text-white px-1 py-0.2 rounded text-[8px] font-bold">VID</span>}
                    {asset.type === 'audio' && <span className="bg-emerald-600/90 text-white px-1 py-0.2 rounded text-[8px] font-bold">AUD</span>}
                    {asset.type === 'image' && <span className="bg-amber-600/90 text-white px-1 py-0.2 rounded text-[8px] font-bold">IMG</span>}
                  </div>
                </div>

                {/* Title and metadata */}
                <div className="mt-1.5 px-0.5">
                  <div className="font-medium text-white truncate text-[11px]" title={asset.name}>
                    {asset.name}
                  </div>
                  <div className="text-[10px] text-gray-400 flex justify-between mt-0.5">
                    <span>{asset.type === 'audio' ? 'Audio' : `${asset.width}x${asset.height}`}</span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const targetTrack = asset.type === 'audio' ? 'a1' : 'v1';
                        addClipToTimeline(asset, targetTrack, playhead);
                      }}
                      className="text-blue-400 hover:text-blue-300 font-bold opacity-0 group-hover:opacity-100 transition"
                      title="Add to timeline at playhead"
                    >
                      + Add
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const proxy = proxyInfo.find(p => p.assetId === asset.id);
                        const hasProxy = proxy?.proxyUrl || false;
                        updateProxyInfo(asset.id, { 
                          proxyUrl: hasProxy ? null : `/proxy/${asset.filename}`,
                          generated: !hasProxy 
                        });
                      }}
                      className="text-pink-400 hover:text-pink-300 font-bold opacity-0 group-hover:opacity-100 transition"
                      title={proxyInfo.find(p => p.assetId === asset.id)?.proxyUrl ? 'Remove Proxy' : 'Generate Proxy'}
                    >
                      {proxyInfo.find(p => p.assetId === asset.id)?.proxyUrl ? '✕ Proxy' : 'Proxy'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col space-y-1">
            {filteredAssets.map(asset => (
              <div
                key={asset.id}
                draggable
                onDragStart={e => handleDragStart(e, asset)}
                onDoubleClick={() => setSourceAsset(asset)}
                className="flex items-center justify-between px-2.5 py-1.5 bg-[#242424] hover:bg-[#2d2d2d] border border-[#333] hover:border-blue-500 rounded cursor-pointer transition text-xs group"
              >
                <div className="flex items-center space-x-2 truncate">
                  {asset.type === 'video' && <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  {asset.type === 'audio' && <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {asset.type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  <span className="font-medium text-white truncate">{asset.name}</span>
                </div>

                <div className="flex items-center space-x-3 text-gray-400 font-mono text-[11px] shrink-0">
                  <span>{formatDuration(asset.duration)}</span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const targetTrack = asset.type === 'audio' ? 'a1' : 'v1';
                      addClipToTimeline(asset, targetTrack, playhead);
                    }}
                    className="px-1.5 py-0.5 bg-[#1473e6] hover:bg-[#2680eb] text-white rounded text-[10px] font-sans font-bold"
                  >
                    + Add
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const proxy = proxyInfo.find(p => p.assetId === asset.id);
                      const hasProxy = proxy?.proxyUrl || false;
                      updateProxyInfo(asset.id, { 
                        proxyUrl: hasProxy ? null : `/proxy/${asset.filename}`,
                        generated: !hasProxy 
                      });
                    }}
                    className="px-1 py-0.5 text-pink-400 hover:text-pink-300 rounded text-[9px] border border-pink-500/30"
                  >
                    {proxyInfo.find(p => p.assetId === asset.id)?.proxyUrl ? '✕' : 'P'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
