import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor } from '../context/EditorContext';
import type { ExportPreset, RenderJob, ExportJob, ExportFormat, ExportMetadata, ExportHistoryItem } from '../types/editor';
import { formatDuration } from '../utils/timecode';
import { 
  X, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Folder,
  Trash2,
  RefreshCw,
  List,
  Clipboard,
} from 'lucide-react';

const PRESETS: ExportPreset[] = [
  {
    id: 'match_source',
    name: 'Match Source - High Bitrate (Recommended)',
    description: 'Matches sequence resolution with very high visual quality.',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '12 Mbps',
    format: 'mp4',
    codec: 'H.264',
  },
  {
    id: 'youtube_1080p',
    name: 'YouTube 1080p Full HD',
    description: 'Optimized for web streaming, YouTube, and Vimeo upload.',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '10 Mbps',
    format: 'mp4',
    codec: 'H.264',
  },
  {
    id: '4k_uhd',
    name: '4K Ultra HD (3840x2160)',
    description: 'High resolution master rendering for 4K displays.',
    width: 3840,
    height: 2160,
    fps: 30,
    bitrate: '35 Mbps',
    format: 'mp4',
    codec: 'H.264',
  },
  {
    id: 'tiktok_reels',
    name: 'Vertical 9:16 (Reels / TikTok / Shorts)',
    description: '1080x1920 portrait format for mobile social platforms.',
    width: 1080,
    height: 1920,
    fps: 30,
    bitrate: '8 Mbps',
    format: 'mp4',
    codec: 'H.264',
  },
  {
    id: 'mobile_720p',
    name: 'Mobile 720p Fast Export',
    description: 'Fast rendering, lightweight file size for quick sharing.',
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: '4 Mbps',
    format: 'mp4',
    codec: 'H.264',
  },
  {
    id: 'mov_prores',
    name: 'ProRes 422 (MOV)',
    description: 'High-quality intermediate format for professional workflows.',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '147 Mbps',
    format: 'mov',
    codec: 'ProRes 422',
  },
  {
    id: 'webm_vp9',
    name: 'WebM VP9',
    description: 'Open web format optimized for streaming.',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '8 Mbps',
    format: 'webm',
    codec: 'VP9',
  },
  {
    id: 'avi',
    name: 'AVI',
    description: 'Legacy Windows Audio Video Interleave format.',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: '12 Mbps',
    format: 'avi',
    codec: 'MPEG-4',
  },
];

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  mp4: '.mp4',
  mov: '.mov',
  webm: '.webm',
  avi: '.avi',
};

// Parse a bitrate string like "12 Mbps" or "800 kbps" into megabits per second.
const parseBitrateMbps = (bitrate: string): number => {
  const match = bitrate.match(/([\d.]+)\s*(Mbps|Mb\/s|kbps|Kbps|Kb\/s)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  if (!isFinite(value)) return 0;
  return /k/i.test(match[2]) ? value / 1000 : value;
};

// Rough target file size: bitrate (Mbps) → MB/s (× 0.125) × duration.
const estimateFileSize = (durationSec: number, bitrate: string): string | null => {
  const mbps = parseBitrateMbps(bitrate);
  if (!mbps || durationSec <= 0) return null;
  const totalMb = (mbps / 8) * durationSec;
  return totalMb >= 1024
    ? `${(totalMb / 1024).toFixed(2)} GB`
    : `${totalMb.toFixed(1)} MB`;
};

// Approximate remaining render time. FFmpeg encodes faster than real-time,
// so this is a conservative "at encoding rate" estimate.
const estimateRenderEta = (progress: number, totalDurationSec: number): string | null => {
  if (progress <= 0 || totalDurationSec <= 0) return null;
  const remainingSec = Math.max(1, Math.round((totalDurationSec * (100 - progress)) / 100));
  return remainingSec >= 60
    ? `~ ${(remainingSec / 60).toFixed(1)} min remaining`
    : `~ ${remainingSec}s remaining`;
};

export const ExportModal: React.FC = () => {
  const {
    project,
    isExportModalOpen,
    setIsExportModalOpen,
    exportQueue,
    exportHistory,
    setExportLocation,
    setExportFormat,
    addExportJob,
    removeExportJob,
    addToExportHistory,
    clearExportQueue,
  } = useEditor();

  const [selectedPreset, setSelectedPreset] = useState<ExportPreset>(PRESETS[0]);
  const [exportName, setExportName] = useState<string>(project.name);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'export' | 'queue' | 'history'>('export');
  const [saveLocation, setSaveLocation] = useState<string>('');
  const [metadata, setMetadata] = useState<ExportMetadata>({});
  // Render speed vs quality: "fastest" is default so renders finish quickly.
  const [speedMode, setSpeedMode] = useState<'fastest' | 'balanced' | 'quality'>('fastest');
  const [afterExportAction, setAfterExportAction] = useState<'none' | 'open_folder' | 'upload_youtube' | 'copy_device'>('none');
  const pollIntervalRef = useRef<number | null>(null);
  // Always keep the newest project snapshot available to the export handler.
  // (A useCallback keyed only on clip count / duration would otherwise send a
  // stale copy of the timeline after effects, text, grades or transforms change.)
  const projectRef = useRef(project);
  projectRef.current = project;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  useEffect(() => {
    setExportName(project.name);
    setRenderJob(null);
  }, [isExportModalOpen, project.name]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const formatExt = useCallback((f: ExportFormat) => FORMAT_EXTENSIONS[f], []);

  const handleStartRender = useCallback(async () => {
    // Read the LIVE project at click time — not a stale closure from when the
    // modal first opened. This is what ensures the export contains your edits.
    const liveProject = projectRef.current;
    if (liveProject.clips.length === 0) {
      alert('There are no clips on the timeline to export. Please add media clips first!');
      return;
    }

    setIsStarting(true);
    setSaveError(null);
    setSavedPath(null);
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: exportName,
          width: selectedPreset.width,
          height: selectedPreset.height,
          fps: selectedPreset.fps,
          duration: liveProject.duration,
          tracks: liveProject.tracks,
          clips: liveProject.clips,
          preset: selectedPreset.codec,
          speedMode,
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || `Render request failed (${res.status})`);
        return;
      }

      {
        const data = await res.json();
        const jobId = data.jobId;
        // Sanitize characters Windows does not allow in file names.
        const safeName = (exportName || 'Export').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Export';
        const outputFileName = `${safeName}${formatExt(selectedPreset.format)}`;

        // Treat the chosen path as a folder, unless it already ends with a
        // video extension — then use it as the exact output file.
        let targetFile = outputFileName;
        let targetDir = saveLocation;
        if (saveLocation && /\.(mp4|mov|webm|avi)$/i.test(saveLocation.trim())) {
          const parts = saveLocation.trim().split(/[\\/]/);
          targetFile = parts.pop() || outputFileName;
          targetDir = parts.join('/');
        }
        const targetPath = saveLocation ? `${targetDir.replace(/[\\/]+$/, '')}/${targetFile}` : '';
        const displayName = saveLocation ? targetFile : outputFileName;

        const exportJob: Omit<ExportJob, 'id' | 'queuePosition' | 'createdAt'> = {
          presetId: selectedPreset.id,
          presetName: selectedPreset.name,
          format: selectedPreset.format,
          location: saveLocation ? { id: 'custom', path: targetDir, label: targetDir } : null,
          outputFileName: displayName,
          outputPath: targetPath || `/exports/${outputFileName}`,
          downloadUrl: `/api/render/download/${jobId}`,
          metadata,
          status: 'processing',
          progress: 5,
          currentTime: 0,
          totalDuration: liveProject.duration,
        };

        addExportJob(exportJob);

        setRenderJob({
          id: jobId,
          projectName: exportName,
          outputFileName: displayName,
          outputPath: targetPath,
          downloadUrl: `/api/render/download/${jobId}`,
          status: 'processing',
          progress: 5,
          currentTime: 0,
          totalDuration: liveProject.duration,
        });

        // Poll job status
        pollIntervalRef.current = window.setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/render/status/${jobId}`);
            if (statusRes.ok) {
              const updatedJob: RenderJob = await statusRes.json();
              setRenderJob(updatedJob);

              if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

                if (updatedJob.status === 'completed') {
                  // Save to custom location first so history reflects reality.
                  let finalPath = updatedJob.downloadUrl;
                  if (saveLocation) {
                    try {
                      const saveRes = await fetch('/api/export/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jobId, outputPath: targetPath }),
                      });
                      const saveData = await saveRes.json().catch(() => ({}));
                      if (saveRes.ok && saveData.success) {
                        finalPath = targetPath;
                        setSavedPath(targetPath);
                      } else {
                        setSaveError(saveData.error || 'Could not save to the chosen folder. Use Download instead.');
                      }
                    } catch (e) {
                      setSaveError(`Could not save to the chosen folder: ${(e as Error).message}`);
                    }
                  }

                  // Move to history
                  addToExportHistory({
                    projectName: exportName,
                    outputFileName: displayName,
                    outputPath: finalPath,
                    format: selectedPreset.format,
                    duration: liveProject.duration,
                    completedAt: Date.now(),
                    downloadUrl: updatedJob.downloadUrl,
                  });

                  // After export action
                  if (afterExportAction === 'open_folder') {
                    // Placeholder - would open OS folder
                    console.log('Open folder:', saveLocation);
                  }
                }
              }
            }
          } catch (e) {
            console.error('Poll status error:', e);
          }
        }, 750);
      }
    } catch (err) {
      console.error('Failed to initiate render:', err);
      setSaveError((err as Error).message);
    } finally {
      setIsStarting(false);
    }
  }, [
    exportName, selectedPreset, formatExt, saveLocation, metadata, afterExportAction,
    speedMode, addExportJob, addToExportHistory, exportQueue.length
  ]);

  const handleRemoveFromQueue = useCallback((jobId: string) => {
    removeExportJob(jobId);
  }, [removeExportJob]);

  const handleClearQueue = useCallback(() => {
    clearExportQueue();
  }, [clearExportQueue]);

  const handleSaveToLocation = useCallback(async () => {
    // In a real app, this would use showSaveFilePicker or a native dialog
    const path = prompt('Enter export folder path:', saveLocation || '/exports/');
    if (path !== null) {
      setSaveLocation(path);
      setExportLocation({ id: 'custom', path, label: path, lastUsed: Date.now() });
    }
  }, [saveLocation, setExportLocation]);

  if (!isExportModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      <div className="bg-[#202020] border border-[#3e3e3e] rounded-lg shadow-2xl w-full max-w-[600px] max-h-[85vh] flex flex-col text-xs text-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#2d2d2d]">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-[#00003b] border border-[#7e5bef] rounded flex items-center justify-center font-bold text-[#9d77f3] text-[10px]">
              Pr
            </div>
            <span className="font-semibold text-white text-sm">Export Sequence - FFmpeg Video Encoder</span>
          </div>
          <button
            onClick={() => setIsExportModalOpen(false)}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex h-7 bg-[#252525] border-b border-[#2d2d2d] shrink-0">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 font-medium border-b-2 transition ${
              activeTab === 'export'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 font-medium border-b-2 transition ${
              activeTab === 'queue'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <List className="w-3 h-3 mr-1" />
            Queue ({exportQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 font-medium border-b-2 transition ${
              activeTab === 'history'
                ? 'border-[#1473e6] text-white bg-[#1e1e1e]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Clipboard className="w-3 h-3 mr-1" />
            History ({exportHistory.length})
          </button>
        </div>

        {/* Content Body (scrollable region) */}
        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'export' ? (
            <>
              {/* Output File Name */}
              <div className="mb-4">
                <label className="block text-gray-400 text-[11px] mb-1 font-medium">Output File Name</label>
                <input
                  type="text"
                  value={exportName}
                  onChange={e => setExportName(e.target.value)}
                  className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-3 py-1.5 text-white font-mono text-xs focus:border-blue-500 outline-none"
                />
              </div>

              {/* Export Location */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-gray-400 text-[11px] font-medium">Export Location</label>
                  <button
                    onClick={handleSaveToLocation}
                    className="px-2 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold"
                  >
                    <Folder className="w-3 h-3 mr-1" />
                    Choose Folder
                  </button>
                </div>
                <div className="bg-[#141414] border border-[#3a3a3a] rounded px-3 py-1.5 text-[10px] text-gray-300 font-mono truncate">
                  {saveLocation || '(default: exports/ folder)'}
                </div>
              </div>

              {/* Format */}
              <div className="mb-4">
                <label className="block text-gray-400 text-[11px] mb-1 font-medium">Container Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.filter(p => p.format === 'mp4' || p.format === 'mov' || p.format === 'webm' || p.format === 'avi').map(p => (
                    <div
                      key={p.id}
                      onClick={() => { setSelectedPreset(p); setExportFormat(p.format); }}
                      className={`p-2 rounded border cursor-pointer transition flex items-center justify-between ${
                        selectedPreset.id === p.id
                          ? 'bg-[#1473e6]/20 border-blue-500 text-white'
                          : 'bg-[#181818] border-[#333] hover:border-gray-500 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-300 group-hover:text-white">{p.name}</span>
                        <span className="text-[9px] text-cyan-400 font-mono">{p.format.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance / Render Speed */}
              <div className="mb-4">
                <label className="block text-gray-400 text-[11px] mb-1 font-medium">Render Performance</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'fastest', label: 'Fastest', hint: '≈3-4× quicker' },
                    { id: 'balanced', label: 'Balanced', hint: 'good compromise' },
                    { id: 'quality', label: 'Best Quality', hint: 'slowest, pristine' },
                  ] as const).map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setSpeedMode(mode.id)}
                      title={mode.hint}
                      className={`px-2 py-1.5 rounded border text-[10px] font-bold transition ${
                        speedMode === mode.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-[#181818] border-[#333] text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      <div>{mode.label}</div>
                      <div className="text-[8px] font-normal text-gray-500">{mode.hint}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-gray-500 mt-1">
                  Hardware-accelerated decoding is always enabled. Quotes, shakes, zooms and chroma keys add render time.
                </p>
              </div>

              {/* Preset Selector */}
              <div className="mb-4">
                <label className="block text-gray-400 text-[11px] mb-1 font-medium">Export Preset</label>
                <div className="grid grid-cols-1 gap-2">
                  {PRESETS.map(preset => (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset)}
                      className={`p-2.5 rounded border cursor-pointer transition flex items-center justify-between ${
                        selectedPreset.id === preset.id
                          ? 'bg-[#1473e6]/20 border-blue-500 text-white'
                          : 'bg-[#181818] border-[#333] hover:border-gray-500 text-gray-300'
                      }`}
                    >
                      <div>
                        <div className="font-semibold flex items-center">
                          {preset.name}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{preset.description}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] text-cyan-400">
                        {preset.width}x{preset.height}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metadata */}
              <div className="mb-4 border border-[#2f2f2f] rounded bg-[#222] p-3">
                <label className="block text-gray-400 text-[11px] mb-2 font-medium">Metadata (embedded in container)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-1">Title</label>
                    <input
                      type="text"
                      value={metadata.title || ''}
                      onChange={e => setMetadata({ ...metadata, title: e.target.value })}
                      className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-[10px] mb-1">Author</label>
                    <input
                      type="text"
                      value={metadata.author || ''}
                      onChange={e => setMetadata({ ...metadata, author: e.target.value })}
                      className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-gray-400 text-[10px] mb-1">Description</label>
                    <input
                      type="text"
                      value={metadata.description || ''}
                      onChange={e => setMetadata({ ...metadata, description: e.target.value })}
                      className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-gray-400 text-[10px] mb-1">Copyright</label>
                    <input
                      type="text"
                      value={metadata.copyright || ''}
                      onChange={e => setMetadata({ ...metadata, copyright: e.target.value })}
                      className="w-full bg-[#141414] border border-[#3a3a3a] rounded px-2 py-1 text-white text-xs focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* After Export */}
              <div className="mb-4">
                <label className="block text-gray-400 text-[11px] mb-2 font-medium">After Export</label>
                <div className="space-y-1">
                  {([
                    { id: 'none', label: 'None' },
                    { id: 'open_folder', label: 'Open Containing Folder' },
                    { id: 'upload_youtube', label: 'Upload to YouTube/Vimeo' },
                    { id: 'copy_device', label: 'Copy to Device' },
                  ] as const).map((a) => (
                    <label
                      key={a.id}
                      className={`flex items-center space-x-2 p-1.5 rounded cursor-pointer transition ${
                        afterExportAction === a.id
                          ? 'bg-[#1473e6]/30 text-blue-400 border border-blue-500/50'
                          : 'bg-[#181818] border-transparent text-gray-400 hover:bg-[#282828] hover:text-white'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={afterExportAction === a.id}
                        onChange={() => setAfterExportAction(a.id)}
                        className="accent-blue-500 rounded"
                      />
                      <span className="text-[10px]">{a.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Summary Specs */}
              <div className="bg-[#141414] rounded p-3 border border-[#2b2b2b] grid grid-cols-4 gap-3 text-[11px] mb-4">
                <div>
                  <span className="text-gray-500 block">Format:</span>
                  <span className="text-white font-medium">{selectedPreset.format.toUpperCase()} / {selectedPreset.codec}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Estimated Duration:</span>
                  <span className="text-white font-mono">{formatDuration(project.duration)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Est. File Size:</span>
                  <span className="text-cyan-300 font-mono font-semibold">
                    {estimateFileSize(project.duration, selectedPreset.bitrate) || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Tracks:</span>
                  <span className="text-white font-mono">{project.tracks.length}</span>
                </div>
              </div>

              {!renderJob && (
                <button
                  onClick={handleStartRender}
                  disabled={isStarting}
                  className="w-full py-2.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-bold shadow transition disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isStarting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Export Video</span>
                </button>
              )}
            </>
          ) : activeTab === 'queue' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">Render Queue</span>
                <button
                  onClick={handleClearQueue}
                  className="px-2 py-1 bg-[#181818] hover:bg-[#282828] rounded text-white text-[10px] font-bold"
                >
                  Clear All
                </button>
              </div>
              {exportQueue.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Queue is empty. Add export jobs from the Export tab.
                </div>
              ) : (
                <div className="space-y-1">
                  {exportQueue.map((job: ExportJob) => (
                    <div key={job.id} className="bg-[#242424] border border-[#333] rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-white truncate">{job.presetName}</span>
                        <span className="text-[9px] text-gray-500 font-mono">#{job.queuePosition}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] mb-1">
                        <span className="text-gray-300 truncate">{job.outputFileName}</span>
                        <span className={`text-[9px] font-mono ${job.status === 'completed' ? 'text-emerald-400' : job.status === 'failed' ? 'text-rose-400' : 'text-blue-400'}`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="w-full bg-[#141414] rounded h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[9px] text-gray-400">
                        <span>{job.progress}%</span>
                        <button
                          onClick={() => handleRemoveFromQueue(job.id)}
                          className="p-1 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">Export History</span>
                <RefreshCw className="w-3 h-3 text-gray-400 cursor-pointer" />
              </div>
              {exportHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No export history yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {exportHistory.map((item: ExportHistoryItem) => (
                    <div key={item.id} className="bg-[#242424] border border-[#333] rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-white truncate">{item.outputFileName}</span>
                        <span className="text-[9px] text-gray-500 font-mono">{item.format.toUpperCase()}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] mb-1">
                        <span className="text-gray-300 truncate">{item.projectName}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-400">{new Date(item.completedAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <a
                          href={item.downloadUrl}
                          download={item.outputFileName}
                          className="px-2 py-1 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white text-[10px] font-bold flex items-center space-x-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </a>
                        <span className="ml-auto text-[9px] text-gray-500 font-mono">
                          {formatDuration(item.duration)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Render Progress Display */}
        {renderJob && activeTab === 'export' && (
          <div className="p-4 bg-[#181818] border-t border-[#2d2d2d]">
            <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
              {renderJob.status === 'processing' && (
                <>
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                  <div>
                    <h3 className="text-base font-semibold text-white">Rendering Video...</h3>
                    <p className="text-gray-400 text-xs mt-1">
                      FFmpeg is compositing layers and encoding {renderJob.outputFileName}.
                    </p>
                  </div>

                  <div className="w-full max-w-md bg-[#141414] rounded-full h-3 border border-[#333] overflow-hidden relative mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-300 pr-progress-shimmer"
                      style={{ width: `${renderJob.progress}%` }}
                    />
                  </div>
                  <div className="font-mono text-sm font-bold text-cyan-400">
                    {renderJob.progress}% Complete
                  </div>
                  <div className="font-mono text-[11px] text-gray-500">
                    {estimateRenderEta(renderJob.progress, renderJob.totalDuration) || 'Calculating...'}
                  </div>
                </>
              )}

              {renderJob.status === 'completed' && (
                <>
                  <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                  <div>
                    <h3 className="text-base font-semibold text-white">Export Completed!</h3>
                    <p className="text-gray-400 text-xs mt-1">
                      Your video file has been rendered successfully.
                    </p>
                  </div>

                  <div className="mt-3 flex flex-col items-center space-y-2">
                    <a
                      href={renderJob.downloadUrl}
                      download={renderJob.outputFileName}
                      className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-bold text-sm shadow transition hover:scale-105"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download {renderJob.outputFileName}</span>
                    </a>
                    {savedPath && (
                      <span className="text-[10px] text-emerald-400 font-mono break-all max-w-md">
                        Saved to: {savedPath}
                      </span>
                    )}
                    {saveError && (
                      <span className="text-[10px] text-amber-400 font-mono break-all max-w-md">
                        {saveError}
                      </span>
                    )}
                  </div>
                </>
              )}

              {renderJob.status === 'failed' && (
                <>
                  <AlertCircle className="w-14 h-14 text-rose-500" />
                  <div>
                    <h3 className="text-base font-semibold text-white">Render Failed</h3>
                    <p className="text-rose-400 text-xs mt-1 max-w-md break-words">
                      {renderJob.error || 'An unexpected error occurred during rendering.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setRenderJob(null)}
                    className="px-4 py-1.5 bg-[#333] hover:bg-[#444] rounded text-white"
                  >
                    Back to Settings
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-t border-[#2d2d2d]">
          <span className="text-[11px] text-gray-500 font-mono">Native FFmpeg Hardware Accelerator</span>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsExportModalOpen(false)}
              className="px-4 py-1.5 rounded hover:bg-[#333] text-gray-300"
            >
              Close
            </button>

            {!renderJob && activeTab === 'export' && (
              <button
                onClick={handleStartRender}
                disabled={isStarting}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white font-bold shadow transition disabled:opacity-50"
              >
                {isStarting ? (
                  <Loader2 className="w-3 h-4 animate-spin" />
                ) : (
                  <Download className="w-3 h-4" />
                )}
                <span>Export Video</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
