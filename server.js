import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const PROJECTS_DIR = path.join(__dirname, 'projects');
const EXPORTS_DIR = path.join(__dirname, 'exports');

[UPLOADS_DIR, THUMBNAILS_DIR, PROJECTS_DIR, EXPORTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/exports', express.static(EXPORTS_DIR));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${baseName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
});

// Render Jobs state store
const renderJobs = new Map();

// Quality/speed presets. "fastest" is the default because a
// superfast x264 pass is typically 3-4x faster than veryfast at
// visually similar quality for web/social delivery.
const SPEED_MODES = {
  fastest: { preset: 'superfast', crf: '23' },
  balanced: { preset: 'veryfast', crf: '21' },
  quality: { preset: 'medium', crf: '19' },
};

// Map a UI font-family name to a real TTF file on disk so exported text
// matches what the preview renders. Falls back to Arial Bold (the preview
// draws text bold).
function resolveFontFile(family) {
  const f = String(family || '').toLowerCase();
  const win = (name) => `C:/Windows/Fonts/${name}`;
  if (f.includes('arial')) return win('arialbd.ttf');
  if (f.includes('impact')) return win('impact.ttf');
  if (f.includes('georgia')) return win('georgiab.ttf');
  if (f.includes('times')) return win('timesbd.ttf');
  if (f.includes('courier') || f.includes('mono')) return win('courbd.ttf');
  if (f.includes('verdana')) return win('verdanab.ttf');
  if (f.includes('trebuchet')) return win('trebucbd.ttf');
  if (f.includes('inter') || f.includes('tahoma')) return win('tahomabd.ttf');
  return win('arialbd.ttf');
}

// Escape a string for use inside a single-quoted ffmpeg filter option value.
function escapeFilterText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// Convert a CSS hex color (#rgb / #rrggbb) to ffmpeg 0xRRGGBB, with alpha
// support appended as @0.0-1.0 when provided.
function hexToFF(hex, alpha) {
  let h = String(hex || '#000000').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  h = (h + '000000').slice(0, 6);
  const base = `0x${h.toUpperCase()}`;
  if (alpha === undefined || alpha === null) return base;
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `${base}@${a.toFixed(2)}`;
}

// Build a drawtext filter for a clip's textProperties so exported titles /
// graphics / captions show the real text instead of the placeholder image.
// Mirrors the preview renderer in ProgramMonitor.tsx.
function buildTextOverlay(clip, width, height, fps) {
  const tp = clip.textProperties;
  if (!tp || !tp.text) return '';
  const start = Math.max(0, clip.startTime || 0);
  const end = start + Math.max(0.1, clip.duration || 1);
  const enable = `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;

  const fontSize = Math.max(8, Math.round(tp.fontSize || 64));
  // Escape the Windows drive colon so ffmpeg doesn't parse "C:" as an option separator.
  const fontFile = resolveFontFile(tp.fontFamily).replace(/:/g, '\\:');
  const fontcolor = hexToFF(tp.color || '#ffffff');
  const align = tp.align || 'center';
  const t = clip.transform || {};
  const tx = Number(t.x || 0);
  const ty = Number(t.y || 0);
  const rot = Number(t.rotation || 0) * Math.PI / 180;
  const tscale = Number(t.scale || 1);
  const effSize = Math.max(1, Math.round(fontSize * tscale));

  const lines = String(tp.text).split('\n');
  const lineHeight = effSize * 1.25;
  const totalH = lines.length * lineHeight;

  const filters = [];

  // Optional background box behind the whole text block
  if (tp.backgroundColor) {
    const bg = String(tp.backgroundColor);
    let boxcolor;
    const rgba = bg.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s/]+([\d.]+)?/i);
    if (rgba) {
      const r = parseInt(rgba[1], 10).toString(16).padStart(2, '0');
      const g = parseInt(rgba[2], 10).toString(16).padStart(2, '0');
      const b = parseInt(rgba[3], 10).toString(16).padStart(2, '0');
      const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
      boxcolor = `0x${r}${g}${b}@${Math.max(0, Math.min(1, a)).toFixed(2)}`;
    } else {
      boxcolor = hexToFF(bg, 0.45);
    }
    // Approximate block width from the longest line (chars * ~0.55em).
    const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const blockW = Math.min(width, Math.round(maxLen * effSize * 0.55) + 40);
    const blockH = Math.round(totalH + effSize * 0.5);
    let bx;
    if (align === 'left') bx = Math.round(width * 0.08 + tx);
    else if (align === 'right') bx = Math.round(width - blockW - width * 0.08 + tx);
    else bx = Math.round((width - blockW) / 2 + tx);
    const by = Math.round((height - blockH) / 2 + ty);
    filters.push(
      `drawbox=x=${bx}:y=${by}:w=${blockW}:h=${blockH}:color=${boxcolor}:t=fill:${enable}`
    );
  }

  // One drawtext per line, stacked, with alignment matching the preview.
  lines.forEach((line, i) => {
    const text = escapeFilterText(line);
    let x;
    if (align === 'left') x = `(${Math.round(width * 0.08)}+${Math.round(tx)})`;
    else if (align === 'right') x = `(w-text_w-${Math.round(width * 0.08)}+${Math.round(tx)})`;
    else x = `(w-text_w)/2+${Math.round(tx)}`;
    const lineCenterY = (height - totalH) / 2 + i * lineHeight + lineHeight / 2;
    const y = `(${Math.round(lineCenterY + ty)}-text_h/2)`;
    const rotPart = rot ? `:rotate=${rot.toFixed(5)}` : '';
    filters.push(
      `drawtext=fontfile='${fontFile}':text='${text}':fontsize=${effSize}:fontcolor=${fontcolor}:x=${x}:y=${y}${rotPart}:${enable}`
    );
  });

  return filters.join(',');
}

// Build a time-based volume expression from a clip's automation keyframes.
// Used by the audio export so Clip Mixer keyframes match the preview.
function buildVolumeAutomationExpression(clip) {
  const kfs = Array.isArray(clip.volumeKeyframes)
    ? clip.volumeKeyframes
        .filter(k => Number.isFinite(Number(k.time)) && Number.isFinite(Number(k.volume)))
        .map(k => ({
          time: Math.max(0, Number(k.time)),
          volume: Math.max(0, Math.min(2, Number(k.volume))),
        }))
        .sort((a, b) => a.time - b.time)
    : [];
  if (kfs.length === 0) return '';
  if (kfs.length === 1) return kfs[0].volume.toFixed(3);

  let expr = kfs[kfs.length - 1].volume.toFixed(3);
  for (let i = kfs.length - 2; i >= 0; i--) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const span = b.time - a.time;
    const segment = span > 0.0001
      ? `(${a.volume.toFixed(3)}+(${(b.volume - a.volume).toFixed(3)})*(t-${a.time.toFixed(3)})/${span.toFixed(3)})`
      : a.volume.toFixed(3);
    expr = `if(lt(t,${b.time.toFixed(3)}),${segment},${expr})`;
  }
  expr = `if(lt(t,${kfs[0].time.toFixed(3)}),${kfs[0].volume.toFixed(3)},${expr})`;
  return expr;
}

// Helper to probe media information via ffprobe or ffmpeg
async function probeMedia(filePath) {
  try {
    const cleanPath = filePath.replace(/\\/g, '/');
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${cleanPath}"`
    );
    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find(s => s.codec_type === 'video');
    const audioStream = data.streams?.find(s => s.codec_type === 'audio');

    let duration = parseFloat(data.format?.duration || 0);
    if (!duration && videoStream?.duration) {
      duration = parseFloat(videoStream.duration);
    }
    if (!duration && audioStream?.duration) {
      duration = parseFloat(audioStream.duration);
    }

    let fps = 30;
    if (videoStream?.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2 && parseFloat(parts[1]) > 0) {
        fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
      }
    }

    return {
      duration: duration || 5.0,
      width: videoStream?.width || 1920,
      height: videoStream?.height || 1080,
      fps: fps || 30,
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream)
    };
  } catch (err) {
    return {
      duration: 10.0,
      width: 1920,
      height: 1080,
      fps: 30,
      hasVideo: true,
      hasAudio: true
    };
  }
}

// Generate thumbnail for video or image
async function generateThumbnail(filePath, outputThumbPath) {
  try {
    const cleanIn = filePath.replace(/\\/g, '/');
    const cleanOut = outputThumbPath.replace(/\\/g, '/');
    await execAsync(
      `ffmpeg -y -ss 00:00:01 -i "${cleanIn}" -vframes 1 -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2" "${cleanOut}"`
    );
    return true;
  } catch (err) {
    try {
      const cleanIn = filePath.replace(/\\/g, '/');
      const cleanOut = outputThumbPath.replace(/\\/g, '/');
      await execAsync(
        `ffmpeg -y -ss 00:00:00 -i "${cleanIn}" -vframes 1 -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2" "${cleanOut}"`
      );
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// Initialize sample media assets if not present
async function initSampleMedia() {
  const sample1 = path.join(UPLOADS_DIR, 'sample_cinematic_countdown.mp4');
  const sample2 = path.join(UPLOADS_DIR, 'sample_color_bars.mp4');
  const sample3 = path.join(UPLOADS_DIR, 'sample_ambient_track.mp3');
  const sample4 = path.join(UPLOADS_DIR, 'sample_title_card.png');

  if (!fs.existsSync(sample1)) {
    console.log('Generating built-in sample media clips using FFmpeg...');
    try {
      const c1 = sample1.replace(/\\/g, '/');
      const c2 = sample2.replace(/\\/g, '/');
      const c3 = sample3.replace(/\\/g, '/');
      const c4 = sample4.replace(/\\/g, '/');

      // 1. Cinematic countdown test pattern (10 sec, 1080p, 30fps)
      await execAsync(
        `ffmpeg -y -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k "${c1}"`
      );
      await generateThumbnail(sample1, path.join(THUMBNAILS_DIR, 'thumb_sample_cinematic_countdown.jpg'));

      // 2. SMPTE Color Bars (8 sec)
      await execAsync(
        `ffmpeg -y -f lavfi -i smptebars=duration=8:size=1920x1080:rate=30 -f lavfi -i sine=frequency=1000:duration=8 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k "${c2}"`
      );
      await generateThumbnail(sample2, path.join(THUMBNAILS_DIR, 'thumb_sample_color_bars.jpg'));

      // 3. Ambient soundtrack (15 sec synth chord)
      await execAsync(
        `ffmpeg -y -f lavfi -i "sine=frequency=220:duration=15" -c:a mp3 -b:a 192k "${c3}"`
      );

      // 4. Sample Title Graphic (1920x1080 PNG)
      await execAsync(
        `ffmpeg -y -f lavfi -i "color=c=#1473e6:s=1920x1080:d=1" -vf "drawtext=text='PREMIERE PRO CLONE':fontsize=84:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -vframes 1 "${c4}"`
      );
      await generateThumbnail(sample4, path.join(THUMBNAILS_DIR, 'thumb_sample_title_card.jpg'));

      console.log('Sample media generated successfully!');
    } catch (err) {
      console.warn('Could not generate sample media automatically:', err.message);
    }
  }
}

// 1. Health check & FFmpeg check
app.get('/api/status', async (req, res) => {
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const firstLine = stdout.split('\n')[0];
    res.json({
      status: 'ok',
      ffmpegInstalled: true,
      ffmpegVersion: firstLine
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      ffmpegInstalled: false,
      error: err.message
    });
  }
});

// 2. Get all media assets
app.get('/api/media', async (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const mediaFiles = files.filter(f => !fs.statSync(path.join(UPLOADS_DIR, f)).isDirectory());

    const assets = await Promise.all(
      mediaFiles.map(async file => {
        const filePath = path.join(UPLOADS_DIR, file);
        const ext = path.extname(file).toLowerCase();
        let type = 'video';
        if (['.mp3', '.wav', '.aac', '.ogg', '.m4a', '.flac'].includes(ext)) {
          type = 'audio';
        } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
          type = 'image';
        }

        const info = await probeMedia(filePath);
        const thumbName = `thumb_${path.basename(file, ext)}.jpg`;
        const thumbPath = path.join(THUMBNAILS_DIR, thumbName);
        let thumbnail = null;

        if (fs.existsSync(thumbPath)) {
          thumbnail = `/uploads/thumbnails/${thumbName}`;
        } else if (type === 'video' || type === 'image') {
          const generated = await generateThumbnail(filePath, thumbPath);
          if (generated) thumbnail = `/uploads/thumbnails/${thumbName}`;
        }

        const stats = fs.statSync(filePath);

        return {
          id: file,
          name: file.replace(/^\d+_/, ''),
          filename: file,
          url: `/uploads/${file}`,
          type,
          duration: type === 'image' ? 5.0 : (info.duration || 5.0),
          width: info.width || 1920,
          height: info.height || 1080,
          fps: info.fps || 30,
          thumbnail,
          size: stats.size
        };
      })
    );

    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Upload new media files
app.post('/api/upload', upload.array('files', 20), async (req, res) => {
  try {
    const uploadedFiles = req.files || [];
    const assets = [];

    for (const file of uploadedFiles) {
      const ext = path.extname(file.filename).toLowerCase();
      let type = 'video';
      if (['.mp3', '.wav', '.aac', '.ogg', '.m4a', '.flac'].includes(ext)) {
        type = 'audio';
      } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
        type = 'image';
      }

      const filePath = file.path;
      const info = await probeMedia(filePath);
      const thumbName = `thumb_${path.basename(file.filename, ext)}.jpg`;
      const thumbPath = path.join(THUMBNAILS_DIR, thumbName);
      let thumbnail = null;

      if (type === 'video' || type === 'image') {
        const generated = await generateThumbnail(filePath, thumbPath);
        if (generated) {
          thumbnail = `/uploads/thumbnails/${thumbName}`;
        }
      }

      assets.push({
        id: file.filename,
        name: file.originalname,
        filename: file.filename,
        url: `/uploads/${file.filename}`,
        type,
        duration: type === 'image' ? 5.0 : (info.duration || 5.0),
        width: info.width || 1920,
        height: info.height || 1080,
        fps: info.fps || 30,
        thumbnail,
        size: file.size
      });
    }

    res.json({ success: true, assets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Render Engine endpoint using genuine FFmpeg filter_complex_script
app.post('/api/render', async (req, res) => {
  const {
    projectName = 'Untitled_Sequence',
    width = 1920,
    height = 1080,
    fps = 30,
    duration = 10,
    tracks = [],
    clips = [],
    preset = 'high',
    speedMode = 'fastest'
  } = req.body;

  if (!clips || clips.length === 0) {
    return res.status(400).json({ error: 'No clips on timeline to render' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const outputFileName = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.mp4`;
  const outputPath = path.join(EXPORTS_DIR, outputFileName);

  const job = {
    id: jobId,
    projectName,
    outputFileName,
    outputPath,
    downloadUrl: `/exports/${outputFileName}`,
    status: 'processing',
    progress: 0,
    currentTime: 0,
    totalDuration: duration,
    startTime: Date.now(),
    error: null
  };

  renderJobs.set(jobId, job);
  res.json({ success: true, jobId, message: 'Rendering started' });

  // Run FFmpeg rendering asynchronously
  executeRenderJob(job, { width, height, fps, duration, tracks, clips, preset, speedMode });
});

// Helper to execute the FFmpeg render process
async function executeRenderJob(job, params) {
  const { width, height, fps, duration, tracks, clips } = params;
  const speed = SPEED_MODES[params.speedMode] || SPEED_MODES.fastest;
  const tempScriptPath = path.join(os.tmpdir(), `fffilter_${job.id}.txt`);

  try {
    const totalDuration = Math.max(0.5, duration);
    const ffmpegArgs = ['-y', '-hide_banner', '-hwaccel', 'auto'];

    // Map unique input files
    const inputFiles = [];
    const clipInputIndexMap = new Map();

    for (const clip of clips) {
      let filePath = path.join(UPLOADS_DIR, clip.assetId);
      if (!fs.existsSync(filePath) && clip.url) {
        filePath = path.join(UPLOADS_DIR, path.basename(clip.url));
      }
      const cleanPath = filePath.replace(/\\/g, '/');

      if (!clipInputIndexMap.has(cleanPath)) {
        clipInputIndexMap.set(cleanPath, inputFiles.length);
        inputFiles.push({
          path: cleanPath,
          type: clip.type
        });
      }
    }

    // Add inputs to ffmpeg
    for (const input of inputFiles) {
      if (input.type === 'image') {
        ffmpegArgs.push('-loop', '1', '-i', input.path);
      } else {
        ffmpegArgs.push('-i', input.path);
      }
    }

    // Construct filter_complex
    const filterComplex = [];
    
    // 1. Base solid black canvas and Base audio silence
    filterComplex.push(
      `color=c=black:s=${width}x${height}:r=${fps}:d=${totalDuration.toFixed(3)},format=yuv420p [v_base]`
    );
    filterComplex.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000:d=${totalDuration.toFixed(3)} [a_base]`
    );

    // Group video clips by track order (V1 at bottom, V2, V3)
    const videoTracks = tracks.filter(t => t.type === 'video' && t.visible !== false);
    const sortedVideoTracks = [...videoTracks].sort((a, b) => {
      const numA = parseInt(a.id.replace(/\D/g, '') || '0');
      const numB = parseInt(b.id.replace(/\D/g, '') || '0');
      return numA - numB;
    });

    let currentVideoCanvas = 'v_base';
    let videoOverlayIndex = 0;

    for (const track of sortedVideoTracks) {
      const trackClips = clips
        .filter(c => c.trackId === track.id && (c.type === 'video' || c.type === 'image'))
        .sort((a, b) => a.startTime - b.startTime);

      for (const clip of trackClips) {
        const cleanPath = path.join(UPLOADS_DIR, clip.assetId).replace(/\\/g, '/');
        const inputIdx = clipInputIndexMap.get(cleanPath) ?? 0;

        const inPoint = Math.max(0, clip.inPoint || 0);
        const clipDur = Math.max(0.1, clip.duration);
        const startTime = Math.max(0, clip.startTime);
        const endTime = startTime + clipDur;
        const opacity = typeof clip.opacity === 'number' ? clip.opacity : 1.0;

        const vScaled = `v_scaled_${videoOverlayIndex}`;
        const nextCanvas = `v_layer_${videoOverlayIndex}`;

        // Graphics / text clips: render the real text (titles, captions, lower
        // thirds) instead of the placeholder title-card image. This matches the
        // preview, which draws textProperties onto the canvas.
        if (clip.textProperties && clip.textProperties.text) {
          const textFilters = buildTextOverlay(clip, width, height, fps);
          // Transparent layer sized to the full frame, then draw the text on it.
          const textLayer = `v_text_${videoOverlayIndex}`;
          filterComplex.push(
            `color=c=black@0.0:s=${width}x${height}:r=${fps}:d=${totalDuration.toFixed(3)},format=rgba [${vScaled}_bg]`
          );
          if (textFilters) {
            filterComplex.push(
              `[${vScaled}_bg]${textFilters} [${textLayer}]`
            );
          } else {
            filterComplex.push(`[${vScaled}_bg]null [${textLayer}]`);
          }
          let textOverlaySource = textLayer;
          if (opacity < 0.99) {
            const vAlpha = `v_alpha_${videoOverlayIndex}`;
            filterComplex.push(
              `[${textLayer}]format=yuva420p,colorchannelmixer=aa=${opacity.toFixed(2)} [${vAlpha}]`
            );
            textOverlaySource = vAlpha;
          }
          filterComplex.push(
            `[${currentVideoCanvas}][${textOverlaySource}] overlay=0:0:enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})':eof_action=pass [${nextCanvas}]`
          );
          currentVideoCanvas = nextCanvas;
          videoOverlayIndex++;
          continue;
        }

        // Calculate color grading and visual effects filters
        let extraFilters = '';
        let hasVideoEffects = false;
        if (clip.colorGrade) {
          const g = clip.colorGrade;
          const exp = Math.max(-1, Math.min(1, (g.exposure || 0) * 0.2));
          const con = Math.max(0.5, Math.min(2.0, 1 + (g.contrast || 0) * 0.01));
          const sat = Math.max(0, Math.min(3.0, (g.saturation ?? 100) * 0.01));
          // Highlights / shadows approximated as extra gain curves on eq
          const hiL = 1 + (g.highlights || 0) * 0.003;
          const shL = 1 + (g.shadows || 0) * 0.002;
          extraFilters += `,eq=brightness=${(exp * hiL * shL).toFixed(3)}:contrast=${con.toFixed(2)}:saturation=${sat.toFixed(2)}`;
          if (g.lut === 'Film Noir Monochrome') {
            extraFilters += `,hue=s=0`;
          }

          /* RGB Curves → ffmpeg `curves` filter (accurate) */
          if (g.curves) {
            const toPts = (pts, ident) => {
              if (!Array.isArray(pts) || pts.length < 2) return ident;
              const sorted = [...pts].sort((a, b) => a.x - b.x);
              const str = sorted.map(p => `${Math.max(0, Math.min(1, p.x)).toFixed(3)}/${Math.max(0, Math.min(1, p.y)).toFixed(3)}`).join(' ');
              const isIdentity = sorted.length === 2 &&
                Math.abs(sorted[0].x) < 0.001 && Math.abs(sorted[0].y) < 0.001 &&
                Math.abs(sorted[1].x - 1) < 0.001 && Math.abs(sorted[1].y - 1) < 0.001;
              return isIdentity ? ident : str;
            };
            const r = toPts(g.curves.red, '0/0 1/1');
            const gr = toPts(g.curves.green, '0/0 1/1');
            const b = toPts(g.curves.blue, '0/0 1/1');
            const m = toPts(g.curves.master, null);
            const cParts = [];
            if (m) cParts.push(`master='${m}'`);
            if (r !== '0/0 1/1') cParts.push(`red='${r}'`);
            if (gr !== '0/0 1/1') cParts.push(`green='${gr}'`);
            if (b !== '0/0 1/1') cParts.push(`blue='${b}'`);
            if (cParts.length > 0) extraFilters += `,curves=${cParts.join(':')}`;
          }

          /* 3-Way Color Wheels → colorbalance (per luminance zone, accurate).
             Same hue→RGB math as the preview (src/utils/colorProcessing.ts). */
          if (g.wheels) {
            const wheelOff = (wheel) => {
              const mag = Math.max(0, Math.min(100, wheel.magnitude || 0)) / 100;
              if (mag === 0) return null;
              const h = ((wheel.angle % 360) + 360) % 360 / 60;
              const sector = Math.floor(h);
              const frac = h - sector;
              let r = 0, gch = 0, b = 0;
              switch (sector) {
                case 0: r = 1; gch = frac; break;
                case 1: r = 1 - frac; gch = 1; break;
                case 2: gch = 1; b = frac; break;
                case 3: gch = 1 - frac; b = 1; break;
                case 4: r = frac; b = 1; break;
                default: r = 1; b = 1 - frac; break;
              }
              const to = (c) => Math.max(-1, Math.min(1, ((c - 0.5) * 2 * mag)));
              return { r: to(r), g: to(gch), b: to(b) };
            };
            const parts = [];
            const applyWheel = (wheel, kind) => {
              // kind: 'shadows' | 'midtones' | 'highlights' → option prefixes rs.. / rm.. / rh..
              const o = wheelOff(wheel);
              if (!o) return;
              const pre = kind === 'shadows' ? 'rs' : kind === 'midtones' ? 'rm' : 'rh';
              parts.push(`${pre}=${o.r.toFixed(2)}:${'g' + pre.slice(1)}=${o.g.toFixed(2)}:${'b' + pre.slice(1)}=${o.b.toFixed(2)}`);
            };
            applyWheel(g.wheels.shadows || {}, 'shadows');
            applyWheel(g.wheels.midtones || {}, 'midtones');
            applyWheel(g.wheels.highlights || {}, 'highlights');
            // Global wheel nudges all three zones equally
            const gW = g.wheels.global || {};
            if (gW.magnitude) {
              applyWheel({ angle: gW.angle, magnitude: gW.magnitude / 2 }, 'shadows');
              applyWheel({ angle: gW.angle, magnitude: gW.magnitude / 2 }, 'midtones');
              applyWheel({ angle: gW.angle, magnitude: gW.magnitude / 2 }, 'highlights');
            }
            if (parts.length > 0) extraFilters += `,colorbalance=${parts.join(':')}`;
          }

          /* HSL Secondary → selectivecolor approximation on the hue band */
          const hsl = g.hslSecondary;
          if (hsl && hsl.enabled && ((hsl.saturationAdj || 0) !== 0 || (hsl.exposure || 0) !== 0)) {
            const center = ((hsl.hue || 0) % 360 + 360) % 360;
            const band = center <= 30 || center > 330 ? 'reds'
              : center <= 90 ? 'yellows'
              : center <= 150 ? 'greens'
              : center <= 210 ? 'cyans'
              : center <= 270 ? 'blues' : 'magentas';
            const satC = Math.max(-1, Math.min(1, -(hsl.saturationAdj || 0) * 0.25 / 100 * (hsl.saturationAdj < 0 ? -1 : 1))).toFixed(2);
            const kC = Math.max(-1, Math.min(1, -(hsl.exposure || 0) * 0.25 / 100)).toFixed(2);
            // selectivecolor per band: CMYK components (space-delimited)
            extraFilters += `,selectivecolor=${band}='${satC} ${satC} ${satC} ${kC}'`;
          }

          /* Vignette strength → ffmpeg vignette filter */
          if ((g.vignette || 0) > 0) {
            const v = Math.max(1, Math.min(100, g.vignette));
            const divisor = Math.max(2, 10 - v / 12).toFixed(2);
            extraFilters += `,vignette=angle=PI/${divisor}`;
          }
        }
        if (clip.appliedEffects) {
          for (const fx of clip.appliedEffects) {
            if (!fx.enabled) continue;
            hasVideoEffects = true;
            if (fx.type === 'blur') extraFilters += `,boxblur=lr=${Math.max(1, Math.round(fx.value / 5))}:lp=1`;
            if (fx.type === 'sharpen') extraFilters += `,unsharp=5:5:${Math.max(0.1, Math.min(2, (fx.value || 50) / 100 * 1.5)).toFixed(2)}:5:5`;
            if (fx.type === 'contrast') extraFilters += `,eq=contrast=${Math.max(0.1, Math.min(3, 1 + (fx.value || 0) / 100)).toFixed(2)}`;
            if (fx.type === 'saturation') extraFilters += `,eq=saturation=${Math.max(0, Math.min(3, 1 + (fx.value || 0) / 100)).toFixed(2)}`;
            if (fx.type === 'brightness') extraFilters += `,eq=brightness=${Math.max(-1, Math.min(1, (fx.value || 0) / 100)).toFixed(3)}`;
            if (fx.type === 'sepia') {
              const s = Math.max(0, Math.min(1, (fx.value || 80) / 100));
              const amt = (a) => (1 - s + s * a).toFixed(3);
              extraFilters += `,colorchannelmixer=rr=${amt(0.393)}:rg=${amt(0.769)}:rb=${amt(0.189)}:gr=${amt(0.349)}:gg=${amt(0.686)}:gb=${amt(0.168)}:br=${amt(0.272)}:bg=${amt(0.534)}:bb=${amt(0.131)}`;
            }
            if (fx.type === 'vintage') {
              const amt = Math.max(0, Math.min(1, (fx.value || 60) / 100));
              extraFilters += `,curves=master='0/0.05 0.5/${(0.5 + 0.04 * amt).toFixed(3)} 1/${(1 - 0.02 * amt).toFixed(3)}',eq=saturation=${(1 - 0.25 * amt).toFixed(2)}:contrast=${(1 + 0.12 * amt).toFixed(2)}`;
            }
            if (fx.type === 'posterize') {
              const levels = Math.max(2, Math.min(32, Math.round(fx.value || 6)));
              // FFmpeg's posterize-equivalent filter (elbg = color quantization)
              extraFilters += `,elbg=codebook_length=${levels}:nb_steps=1`;
            }
            if (fx.type === 'mirror') {
              extraFilters += fx.params?.axis === 'h' ? ',hflip' : ',vflip';
            }
            if (fx.type === 'noise') {
              const amt = Math.max(1, Math.min(100, Math.round((fx.value || 50) * 0.4)));
              extraFilters += `,noise=alls=${amt}:allf=t`;
            }
            if (fx.type === 'vignetteCustom') {
              const v = Math.max(1, Math.min(100, fx.value || 50));
              const divisor = Math.max(2, 10 - v / 12).toFixed(2);
              extraFilters += `,vignette=angle=PI/${divisor}`;
            }
            if (fx.type === 'tint') {
              const hex = String(fx.params?.tintColor || '#ff0000').replace('#', '').padEnd(6, '0');
              const amt = Math.max(0, Math.min(1, (fx.value || 50) / 100)) * 0.6;
              extraFilters += `,colorbalance=rs=${(parseInt(hex.slice(0, 2), 16) / 255 - 0.5) * amt * 2}:gs=${(parseInt(hex.slice(2, 4), 16) / 255 - 0.5) * amt * 2}:bs=${(parseInt(hex.slice(4, 6), 16) / 255 - 0.5) * amt * 2}`;
            }
            if (fx.type === 'bw') extraFilters += `,hue=s=0`;
            if (fx.type === 'invert') extraFilters += `,negate`;
            // AI Background Removal mode: green-screen keyer.
            // fx.value = similarity tolerance in % (0-100)
            if (fx.type === 'chromaKey') {
              const similarity = Math.max(0.05, Math.min(1, (fx.value || 30) / 100));
              const blend = ((fx.params?.spill ?? 8) / 100).toFixed(2);
              extraFilters += `,chromakey=0x00ff00:${similarity.toFixed(2)}:${blend}`;
            }
            // Slow zoom / Ken Burns: zoompan reloads each frame with a growing zoom.
            // fx.value = total zoom % over the clip duration.
            if (fx.type === 'slowZoom') {
              const totalZoom = Math.max(1.05, Math.min(1.5, 1 + (fx.value || 15) / 100));
              const frames = Math.max(1, Math.round(clipDur * fps));
              const rate = ((totalZoom - 1) / frames).toFixed(5);
              extraFilters += `,zoompan=z='min(1+${rate}*in,${totalZoom.toFixed(2)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
            }
            // Handheld camera shake: per-frame crop window jitter.
            // fx.value = shake strength in % (0-100)
            if (fx.type === 'cameraShake') {
              const strength = Math.max(4, Math.min(60, Math.round((fx.value || 30) * 0.8)));
              const half = Math.round(strength / 2);
              extraFilters += `,crop=iw-${strength}:ih-${strength}:x='${half}+${half}*sin(43*t)':y='${half}+${half}*cos(29*t)'`;
            }
          }
        }

        // Clip transform + speed (match the preview renderer).
        const t = clip.transform || {};
        const tScale = Math.max(0.05, Number(t.scale || 1));
        const tRot = Number(t.rotation || 0);
        const tX = Number(t.x || 0);
        const tY = Number(t.y || 0);
        // Preview speeds up by playing source faster; images are stills (ignore speed).
        const effSpeed = clip.type === 'image'
          ? 1
          : Math.max(0.1, Math.min(4, Number(clip.speed || 1)));

        // Fit the source into a box scaled by transform.scale (zoom about center).
        const boxW = Math.round(width * tScale);
        const boxH = Math.round(height * tScale);
        // At speed S we must consume S x the timeline seconds of source to fill clipDur.
        const srcDur = clipDur * effSpeed;

        // Trim, apply speed via setpts, fit-scale (with zoom), then apply effects.
        // No full-frame pad: keep transparent surroundings so the offset/rotation
        // behaves like the preview (image centered on a transparent canvas).
        let preFilters;
        if (clip.type === 'image') {
          preFilters =
            `fps=${fps},trim=duration=${clipDur.toFixed(3)},setpts=PTS-STARTPTS+${startTime.toFixed(3)}/TB`;
        } else if (Math.abs(effSpeed - 1) < 0.001) {
          preFilters =
            `fps=${fps},trim=start=${inPoint.toFixed(3)}:duration=${srcDur.toFixed(3)},setpts=PTS-STARTPTS+${startTime.toFixed(3)}/TB`;
        } else {
          preFilters =
            `fps=${fps},trim=start=${inPoint.toFixed(3)}:duration=${srcDur.toFixed(3)},setpts=(PTS-STARTPTS)/${effSpeed.toFixed(4)}+${startTime.toFixed(3)}/TB`;
        }
        const fitScale = `scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease`;
        const rotatePart = tRot !== 0
          ? `,format=rgba,rotate=a=${(tRot * Math.PI / 180).toFixed(5)}:fillcolor=none`
          : '';
        filterComplex.push(
          `[${inputIdx}:v]${preFilters},${fitScale}${rotatePart}${extraFilters} [${vScaled}]`
        );

        // Apply opacity if < 1.0
        let overlaySource = vScaled;
        if (opacity < 0.99) {
          const vAlpha = `v_alpha_${videoOverlayIndex}`;
          filterComplex.push(
            `[${vScaled}]format=yuva420p,colorchannelmixer=aa=${opacity.toFixed(2)} [${vAlpha}]`
          );
          overlaySource = vAlpha;
        }

        // Overlay centered on the canvas, then apply the transform x/y offset.
        filterComplex.push(
          `[${currentVideoCanvas}][${overlaySource}] overlay=x='(${width}-w)/2+${tX}':y='(${height}-h)/2+${tY}':enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})':eof_action=pass [${nextCanvas}]`
        );

        currentVideoCanvas = nextCanvas;
        videoOverlayIndex++;
      }
    }

    // Process Audio clips
    const audioTracks = tracks.filter(t => t.type === 'audio' && t.muted !== true);
    const audioClipsToMix = ['[a_base]'];
    let audioIndex = 0;

    for (const track of audioTracks) {
      const trackClips = clips
        .filter(c => c.trackId === track.id && (c.type === 'audio' || c.type === 'video'))
        .sort((a, b) => a.startTime - b.startTime);

      const trackVolume = typeof track.volume === 'number' ? track.volume : 1.0;

      for (const clip of trackClips) {
        if (clip.muted) continue;
        const cleanPath = path.join(UPLOADS_DIR, clip.assetId).replace(/\\/g, '/');
        const inputIdx = clipInputIndexMap.get(cleanPath) ?? 0;

        const inPoint = Math.max(0, clip.inPoint || 0);
        const clipDur = Math.max(0.1, clip.duration);
        const startMs = Math.round(Math.max(0, clip.startTime) * 1000);
        const clipVolume = (typeof clip.volume === 'number' ? clip.volume : 1.0) * trackVolume;
        // Match video speed: consume S x the timeline seconds of source, then
        // play it back S x faster so the audio stays in sync with the picture.
        const audSpeed = Math.max(0.5, Math.min(2, Number(clip.speed || 1)));
        const audSrcDur = clipDur * audSpeed;

        const aTag = `a_out_${audioIndex}`;
        let aChain = `[${inputIdx}:a]atrim=start=${inPoint.toFixed(3)}:duration=${audSrcDur.toFixed(3)},asetpts=PTS-STARTPTS`;
        if (Math.abs(audSpeed - 1) > 0.01) {
          // atempo accepts 0.5..2.0; chain for values outside that range.
          let rem = audSpeed;
          while (rem > 2.0) { aChain += `,atempo=2.0`; rem /= 2.0; }
          while (rem < 0.5) { aChain += `,atempo=0.5`; rem *= 2.0; }
          aChain += `,atempo=${rem.toFixed(4)}`;
        }

        // AI Audio Clean filters applied BEFORE time-shifts so fades stay aligned.
        if (clip.appliedEffects) {
          for (const fx of clip.appliedEffects) {
            if (!fx.enabled) continue;
            if (fx.category !== 'audio') continue;
            if (fx.type === 'highPass') aChain += `,highpass=f=${Math.max(60, Math.min(220, fx.value || 80))}`; // DeNoise: cut rumble/hum
            if (fx.type === 'lowPass') aChain += `,lowpass=f=${Math.max(9000, Math.min(20000, fx.value || 15000))}`;
            if (fx.type === 'eq') aChain += `,equalizer=f=3200:t=q:w=1.2:g=${(((fx.value || 50) - 50) / 10).toFixed(1)}`;
            if (fx.type === 'bassBoost') aChain += `,equalizer=f=200:t=q:w=0.8:g=${(3 + (fx.value || 50) / 100 * 9).toFixed(1)}`;
            if (fx.type === 'compressor') aChain += `,acompressor=threshold=0.08:ratio=4:attack=5:release=50`;
            if (fx.type === 'distortion') aChain += `,acrusher=bits=8:mode=log:aa=1:mix=${Math.max(0, Math.min(1, (fx.value || 30) / 100)).toFixed(2)}`;
            if (fx.type === 'delay') {
              const dt = Math.max(20, Math.min(1500, Number(fx.params?.delayTime) || 300));
              const fb = Math.max(0, Math.min(0.9, (Number(fx.params?.feedback) || 30) / 100));
              const mix = Math.max(0, Math.min(1, (Number(fx.params?.mix) ?? (fx.value || 30)) / 100));
              aChain += `,aecho=0.8:${(0.8 + fb * 0.19).toFixed(2)}:${dt}:${(0.4 * mix + 0.2).toFixed(2)}`;
            }
            if (fx.type === 'reverb') {
              const mix = Math.max(0, Math.min(1, (Number(fx.params?.mix) ?? (fx.value || 30)) / 100));
              aChain += `,aecho=0.8:0.88:60|120|180:${(0.3 * mix + 0.1).toFixed(2)}|${(0.2 * mix + 0.05).toFixed(2)}|${(0.1 * mix + 0.02).toFixed(2)}`;
            }
            if (fx.type === 'flanger') {
              const rate = Math.max(0.1, Math.min(10, 0.1 + (Number(fx.params?.rate) || 30) / 100 * 4));
              const depth = Math.max(1, Math.min(10, 1 + (Number(fx.params?.depth) || 30) / 100 * 9));
              aChain += `,flanger=delay=5:depth=${depth.toFixed(1)}:regen=${Math.max(0, Math.min(95, Number(fx.params?.feedback) || 30))}:width=71:speed=${rate.toFixed(1)}`;
            }
            if (fx.type === 'phaser') {
              aChain += `,aphaser=in_gain=0.4:out_gain=0.74:delay=3:decay=0.4:speed=${(0.1 + (Number(fx.params?.rate) || 30) / 100 * 4).toFixed(2)}`;
            }
            if (fx.type === 'pitchShift') {
              const semis = Math.max(-12, Math.min(12, fx.value || 0));
              if (semis !== 0) {
                const ratio = Math.pow(2, semis / 12);
                aChain += `,asetrate=${Math.round(48000 * ratio)},aresample=48000,atempo=${(1 / ratio).toFixed(4)}`;
              }
            }
            if (fx.type === 'timeStretch') {
              const rate = Math.max(0.5, Math.min(2, (fx.value || 100) / 100));
              if (Math.abs(rate - 1) > 0.01) aChain += `,atempo=${rate.toFixed(2)}`;
            }
            if (fx.type === 'loudnessNorm') aChain += `,loudnorm=I=-16:LRA=11:TP=-1.5`;
          }
        }

        // Fade in / fade out (relative to the clip's own audio)
        const fadeCurve = clip.audioTransition === 'constant-power'
          ? 'qsin'
          : clip.audioTransition === 'exponential'
            ? 'exp'
            : 'tri';
        const fadeInS = Math.max(0, Math.min(clipDur, clip.fadeIn || 0));
        if (fadeInS > 0.005) aChain += `,afade=t=in:st=0:d=${fadeInS.toFixed(3)}:curve=${fadeCurve}`;
        const fadeOutS = Math.max(0, Math.min(clipDur, clip.fadeOut || 0));
        if (fadeOutS > 0.005) aChain += `,afade=t=out:st=${(clipDur - fadeOutS).toFixed(3)}:d=${fadeOutS.toFixed(3)}:curve=${fadeCurve}`;

        // Per-clip + track pan (live preview uses the same additive mix).
        const clipPan = Math.max(-1, Math.min(1, Number(clip.pan || 0) + Number(track.pan || 0)));
        if (Math.abs(clipPan) > 0.001) {
          aChain += `,aformat=channel_layouts=stereo,stereotools=balance_out=${clipPan.toFixed(2)}`;
        }

        // Volume keyframe automation from the Clip Mixer graph. Apply before
        // adelay so keyframe times stay relative to the clip's start.
        const volumeAutomation = buildVolumeAutomationExpression(clip);
        aChain += `,volume=${clipVolume.toFixed(2)}`;
        if (volumeAutomation) {
          aChain += `,volume='${volumeAutomation}':eval=frame`;
        }

        if (startMs > 0) {
          aChain += `,adelay=${startMs}|${startMs}`;
        }
        aChain += `,aformat=sample_rates=48000:channel_layouts=stereo [${aTag}]`;

        filterComplex.push(aChain);
        audioClipsToMix.push(`[${aTag}]`);
        audioIndex++;
      }
    }

    // Mix audio with normalize=0 to preserve genuine volume
    filterComplex.push(
      `${audioClipsToMix.join('')} amix=inputs=${audioClipsToMix.length}:dropout_transition=0:normalize=0,aformat=sample_rates=48000:channel_layouts=stereo [final_a]`
    );

    // Write filter_complex to file to prevent command line length overflow on Windows
    const filterScriptContent = filterComplex.join(';\n');
    fs.writeFileSync(tempScriptPath, filterScriptContent, 'utf-8');

    // Assemble FFmpeg arguments
    ffmpegArgs.push('-filter_complex', filterComplex.join(';\n'));
    ffmpegArgs.push('-map', `[${currentVideoCanvas}]`);
    ffmpegArgs.push('-map', '[final_a]');
    ffmpegArgs.push('-t', `${totalDuration.toFixed(3)}`);
    ffmpegArgs.push('-c:v', 'libx264');
    ffmpegArgs.push('-preset', speed.preset);
    ffmpegArgs.push('-crf', speed.crf);
    ffmpegArgs.push('-threads', '0');
    ffmpegArgs.push('-filter_threads', '0');
    ffmpegArgs.push('-pix_fmt', 'yuv420p');
    ffmpegArgs.push('-c:a', 'aac');
    ffmpegArgs.push('-b:a', '192k');
    ffmpegArgs.push('-progress', 'pipe:1');
    ffmpegArgs.push('-movflags', '+faststart');
    ffmpegArgs.push(job.outputPath.replace(/\\/g, '/'));

    console.log(`Starting FFmpeg render job: ${job.id}`);

    const ffmpegProc = spawn('ffmpeg', ffmpegArgs);
    const totalDurationUs = totalDuration * 1_000_000;

    ffmpegProc.stdout.on('data', chunk => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const [k, v] = line.trim().split('=');
        if (k === 'out_time_us') {
          const currentUs = parseInt(v, 10);
          if (!isNaN(currentUs) && totalDurationUs > 0) {
            job.progress = Math.min(99, Math.max(0, Math.round((currentUs / totalDurationUs) * 100)));
            job.currentTime = currentUs / 1_000_000;
          }
        } else if (k === 'progress' && v === 'end') {
          job.progress = 100;
        }
      }
    });

    let stderrBuffer = '';
    ffmpegProc.stderr.on('data', chunk => {
      stderrBuffer += chunk.toString();
      if (stderrBuffer.length > 20000) {
        stderrBuffer = stderrBuffer.slice(-20000);
      }
    });

    ffmpegProc.on('close', code => {
      try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (e) {}

      if (code === 0) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();
        console.log(`Render job ${job.id} completed successfully!`);
      } else {
        job.status = 'failed';
        job.error = `FFmpeg failed with code ${code}: ${stderrBuffer.slice(-800)}`;
        console.error(`Render job ${job.id} failed:`, job.error);
      }
    });

    ffmpegProc.on('error', err => {
      try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (e) {}
      job.status = 'failed';
      job.error = err.message;
      console.error(`Render job ${job.id} process error:`, err);
    });

  } catch (err) {
    try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (e) {}
    job.status = 'failed';
    job.error = err.message;
    console.error('Render exception:', err);
  }
}

// 5. Check Render Job Status
app.get('/api/render/status/:jobId', (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Render job not found' });
  }
  res.json(job);
});

// 6. Download rendered MP4
app.get('/api/render/download/:jobId', (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Render job not found' });
  }
  if (job.status !== 'completed' || !fs.existsSync(job.outputPath)) {
    return res.status(400).json({ error: 'Render job is not completed or file does not exist' });
  }

  res.download(job.outputPath, job.outputFileName);
});

// 6b. Save rendered file to user-chosen folder
app.post('/api/export/save', (req, res) => {
  try {
    const { jobId, outputPath } = req.body;
    if (!jobId || !outputPath) {
      return res.status(400).json({ error: 'Missing jobId or outputPath' });
    }

    const job = renderJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Render job not found' });
    }
    if (job.status !== 'completed' || !fs.existsSync(job.outputPath)) {
      return res.status(400).json({ error: 'Render job is not completed or file does not exist' });
    }

    // Ensure target directory exists
    const targetDir = path.dirname(outputPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy file to chosen location
    fs.copyFileSync(job.outputPath, outputPath);

    // Remember where the user saved it, but keep outputPath pointing at the
    // rendered file in exports/ so the Download button always keeps working.
    job.savedPath = outputPath;
    job.savedAt = new Date().toISOString();

    res.json({ success: true, outputPath, outputFileName: path.basename(outputPath) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6c. Export history
app.get('/api/export/history', (req, res) => {
  try {
    const history = Array.from(renderJobs.values())
      .filter(j => j.status === 'completed')
      .map(j => ({
        id: j.id,
        projectName: j.projectName,
        outputFileName: j.outputFileName,
        outputPath: j.outputPath,
        format: 'mp4',
        duration: j.totalDuration,
        completedAt: j.completedAt || j.startTime,
        downloadUrl: j.downloadUrl,
      }));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6d. Auto-Save version management
app.post('/api/projects/autosave', (req, res) => {
  try {
    const { projectId, version } = req.body;
    if (!projectId || !version) {
      return res.status(400).json({ error: 'Missing projectId or version' });
    }

    const autosaveDir = path.join(PROJECTS_DIR, 'autosave');
    if (!fs.existsSync(autosaveDir)) {
      fs.mkdirSync(autosaveDir, { recursive: true });
    }

    const fileName = `autosave_${projectId}_${Date.now()}.json`;
    const filePath = path.join(autosaveDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(version, null, 2), 'utf-8');

    // Clean up old versions - keep only latest 20 per project
    const files = fs.readdirSync(autosaveDir)
      .filter(f => f.startsWith(`autosave_${projectId}_`))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(autosaveDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 20) {
      files.slice(20).forEach(f => {
        try { fs.unlinkSync(path.join(autosaveDir, f.name)); } catch (e) {}
      });
    }

    res.json({ success: true, fileName, filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/autosave/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const autosaveDir = path.join(PROJECTS_DIR, 'autosave');
    if (!fs.existsSync(autosaveDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(autosaveDir)
      .filter(f => f.startsWith(`autosave_${projectId}_`))
      .map(f => {
        const stat = fs.statSync(path.join(autosaveDir, f));
        const content = fs.readFileSync(path.join(autosaveDir, f), 'utf-8');
        const data = JSON.parse(content);
        return {
          id: f,
          projectId,
          name: data.name || 'Untitled',
          timestamp: stat.mtime.getTime(),
          fileSize: stat.size,
          clipCount: data.clips?.length || 0,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/autosave/restore/:versionId', (req, res) => {
  try {
    const { versionId } = req.params;
    const autosaveDir = path.join(PROJECTS_DIR, 'autosave');
    const filePath = path.join(autosaveDir, versionId);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Auto-save version not found' });
    }

    const projectData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(projectData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Project Saving & Loading
app.post('/api/projects/save', (req, res) => {
  try {
    const project = req.body;
    if (!project || !project.id) {
      return res.status(400).json({ error: 'Invalid project payload' });
    }

    const fileName = `${project.id}.prproj.json`;
    const filePath = path.join(PROJECTS_DIR, fileName);
    project.updatedAt = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
    res.json({ success: true, message: 'Project saved successfully', projectId: project.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.prproj.json'));
    const projectsList = files.map(file => {
      try {
        const content = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf-8');
        const data = JSON.parse(content);
        return {
          id: data.id,
          name: data.name,
          duration: data.duration,
          updatedAt: data.updatedAt || fs.statSync(path.join(PROJECTS_DIR, file)).mtime,
          clipCount: data.clips?.length || 0,
          assetCount: data.assets?.length || 0
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json(projectsList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const fileName = `${req.params.id}.prproj.json`;
    const filePath = path.join(PROJECTS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(projectData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7b. Project Manager - relink media
app.post('/api/projects/relink', async (req, res) => {
  try {
    const { clipId, newPath } = req.body;
    if (!clipId || !newPath) {
      return res.status(400).json({ error: 'Missing clipId or newPath' });
    }

    // Check if file exists
    if (!fs.existsSync(newPath)) {
      return res.status(400).json({ error: 'File not found at path' });
    }

    // Probe media info
    let info = { duration: 5.0, width: 1920, height: 1080, fps: 30 };
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${newPath.replace(/\\/g, '/')}"`
      );
      const data = JSON.parse(stdout);
      const videoStream = data.streams?.find(s => s.codec_type === 'video');
      const audioStream = data.streams?.find(s => s.codec_type === 'audio');
      if (data.format?.duration) info.duration = parseFloat(data.format.duration);
      else if (videoStream?.duration) info.duration = parseFloat(videoStream.duration);
      else if (audioStream?.duration) info.duration = parseFloat(audioStream.duration);
      if (videoStream) { info.width = videoStream.width || 1920; info.height = videoStream.height || 1080; }
      if (videoStream?.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        if (parts.length === 2 && parseFloat(parts[1]) > 0) {
          info.fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
        }
      }
    } catch (e) {}

    res.json({ success: true, clipId, newPath, info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7c. Project Manager - collect files
app.post('/api/projects/collect', (req, res) => {
  try {
    const { projectId, targetDir } = req.body;
    if (!projectId || !targetDir) {
      return res.status(400).json({ error: 'Missing projectId or targetDir' });
    }

    const projectFile = path.join(PROJECTS_DIR, `${projectId}.prproj.json`);
    if (!fs.existsSync(projectFile)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
    const copied = [];
    const missed = [];

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy all referenced media assets to targetDir
    for (const clip of projectData.clips || []) {
      const asset = projectData.assets?.find(a => a.id === clip.assetId);
      if (asset) {
        const srcPath = path.join(__dirname, asset.filename || asset.url);
        if (fs.existsSync(srcPath)) {
          const destPath = path.join(targetDir, path.basename(srcPath));
          try {
            fs.copyFileSync(srcPath, destPath);
            copied.push({ assetId: asset.id, src: srcPath, dest: destPath });
          } catch (e) {
            missed.push({ assetId: asset.id, name: asset.name, error: e.message });
          }
        } else {
          missed.push({ assetId: asset.id, name: asset.name, error: 'Source file not found' });
        }
      }
    }

    res.json({ success: true, copied, missed, totalSize: copied.reduce((s, c) => s + 0, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Express Server
app.listen(PORT, async () => {
  console.log(`Premiere Pro Clone Backend API running on http://localhost:${PORT}`);
  await initSampleMedia();
});
