import React, { useState, useEffect, useRef } from 'react';
import { useEditor } from '../context/EditorContext';
import type { Project } from '../types/editor';
import { X, FolderOpen, FilePlus, Calendar, Film, Upload } from 'lucide-react';

export const NewProjectModal: React.FC = () => {
  const { isNewProjectModalOpen, setIsNewProjectModalOpen, createNewProject } = useEditor();
  const [name, setName] = useState<string>('Sequence 01');
  const [resolution, setResolution] = useState<{ width: number; height: number; name: string }>({
    width: 1920,
    height: 1080,
    name: '1080p Full HD (16:9)'
  });
  const [fps, setFps] = useState<number>(30);

  if (!isNewProjectModalOpen) return null;

  const handleCreate = () => {
    createNewProject(name, resolution.width, resolution.height, fps);
    setIsNewProjectModalOpen(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#202020] border border-[#3e3e3e] rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-xs text-gray-200">
        <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2d2d2d]">
          <div className="flex items-center space-x-2 font-semibold text-white text-sm">
            <FilePlus className="w-4 h-4 text-blue-400" />
            <span>New Sequence</span>
          </div>
          <button onClick={() => setIsNewProjectModalOpen(false)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-gray-400 block mb-1">Sequence Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-3 py-1.5 text-white font-mono outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-gray-400 block mb-1">Preset Format</label>
            <div className="space-y-1.5">
              {[
                { width: 1920, height: 1080, name: '1080p Full HD (16:9)' },
                { width: 3840, height: 2160, name: '4K Ultra HD (16:9)' },
                { width: 1080, height: 1920, name: 'Vertical Reel/Short (9:16)' },
                { width: 1080, height: 1080, name: 'Square Post (1:1)' }
              ].map(res => (
                <div
                  key={res.name}
                  onClick={() => setResolution(res)}
                  className={`p-2 rounded border cursor-pointer transition flex justify-between items-center ${
                    resolution.name === res.name
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-[#181818] border-[#333] hover:border-gray-500 text-gray-300'
                  }`}
                >
                  <span>{res.name}</span>
                  <span className="font-mono text-cyan-400 text-[11px]">{res.width}x{res.height}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 block mb-1">Timebase Frame Rate</label>
            <div className="flex space-x-2">
              {[24, 30, 60].map(f => (
                <button
                  key={f}
                  onClick={() => setFps(f)}
                  className={`flex-1 py-1.5 rounded font-mono font-bold border transition ${
                    fps === f ? 'bg-blue-600 border-blue-400 text-white' : 'bg-[#181818] border-[#333] text-gray-400 hover:text-white'
                  }`}
                >
                  {f} fps
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 px-4 py-3 bg-[#181818] border-t border-[#2d2d2d]">
          <button
            onClick={() => setIsNewProjectModalOpen(false)}
            className="px-3 py-1.5 rounded hover:bg-[#333] text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-1.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-medium shadow"
          >
            Create Sequence
          </button>
        </div>
      </div>
    </div>
  );
};

export const OpenProjectModal: React.FC = () => {
  const { isOpenProjectModalOpen, setIsOpenProjectModalOpen, loadProjectData } = useEditor();
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpenProjectModalOpen) {
      setIsLoading(true);
      fetch('/api/projects')
        .then(res => res.json())
        .then(data => setProjects(data || []))
        .catch(err => console.error('Failed to load projects:', err))
        .finally(() => setIsLoading(false));
    }
  }, [isOpenProjectModalOpen]);

  if (!isOpenProjectModalOpen) return null;

  const handleSelectProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const projectData: Project = await res.json();
        loadProjectData(projectData);
        setIsOpenProjectModalOpen(false);
      }
    } catch (err) {
      console.error('Error loading project:', err);
    }
  };

  const handleLoadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.clips) {
          loadProjectData(parsed);
          setIsOpenProjectModalOpen(false);
        }
      } catch (err) {
        alert('Invalid .prproj.json file format');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#202020] border border-[#3e3e3e] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden text-xs text-gray-200">
        <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2d2d2d]">
          <div className="flex items-center space-x-2 font-semibold text-white text-sm">
            <FolderOpen className="w-4 h-4 text-yellow-400" />
            <span>Open Premiere Project</span>
          </div>
          <button onClick={() => setIsOpenProjectModalOpen(false)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-gray-400 font-medium">Saved Projects on Server:</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 font-semibold"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Browse .prproj file...</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.prproj"
              className="hidden"
              onChange={handleLoadFromFile}
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border border-dashed border-[#333] rounded">
                No saved projects found on server. Click "Browse .prproj file" to open a local project.
              </div>
            ) : (
              projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelectProject(p.id)}
                  className="p-3 bg-[#181818] hover:bg-[#282828] border border-[#333] hover:border-blue-500 rounded cursor-pointer transition flex items-center justify-between group"
                >
                  <div>
                    <span className="font-semibold text-white block text-sm group-hover:text-blue-400">{p.name}</span>
                    <span className="text-[10px] text-gray-400 flex items-center space-x-2 mt-1">
                      <span className="flex items-center"><Film className="w-3 h-3 mr-1" /> {p.clipCount} clips</span>
                      <span>•</span>
                      <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {new Date(p.updatedAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                  <span className="px-2 py-1 bg-blue-600/30 text-blue-400 font-bold rounded text-[11px] group-hover:bg-blue-600 group-hover:text-white transition">
                    Open
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-end px-4 py-3 bg-[#181818] border-t border-[#2d2d2d]">
          <button
            onClick={() => setIsOpenProjectModalOpen(false)}
            className="px-4 py-1.5 rounded hover:bg-[#333] text-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
