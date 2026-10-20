import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditor } from '../context/EditorContext';
import type { AppliedEffect, MulticamAngle, ShapeLayer, TimelineClip } from '../types/editor';
import { formatTimecode } from '../utils/timecode';
import { gradeNeedsPixels, processClipRegion } from '../utils/colorProcessing';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Repeat, 
  Grid,
  Minimize2,
} from 'lucide-react';

/** Where a shape is drawn on the canvas, accounting for its pin setting. */
function shapeBasePos(shape: ShapeLayer, w: number, h: number): { x: number; y: number } {
  if (shape.pin === 'none') return { x: shape.x, y: shape.y };
  const ox = shape.pinOffset?.x ?? 0;
  const oy = shape.pinOffset?.y ?? 0;
  switch (shape.pin) {
    case 'top-left': return { x: ox, y: oy };
    case 'top-right': return { x: w - shape.width - ox, y: oy };
    case 'bottom-left': return { x: ox, y: h - shape.height - oy };
    case 'bottom-right': return { x: w - shape.width - ox, y: h - shape.height - oy };
    default: return { x: w / 2 - shape.width / 2 + ox, y: h / 2 - shape.height / 2 + oy }; // center
  }
}


export const ProgramMonitor: React.FC = () => {
  const { 
    project, 
    playhead, 
    seek, 
    isPlaying, 
    togglePlay, 
    stepFrames,
    beforeAfterState,
    toggleBeforeAfter,
    setBeforeAfterSplit: _setBeforeAfterSplit,
    shapeLayers,
    updateShapeLayer,
    selectedShapeId,
    setSelectedShapeId,
    textAnimations,
    multicamSequences,
    setMulticamActiveAngle,
    activeMulticamId,
    setSelectedClipId,
    updateClipProperties,
  } = useEditor();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const [safeMargins, setSafeMargins] = useState<boolean>(false);
  const [playbackRes, setPlaybackRes] = useState<'Full' | '1/2' | '1/4'>('Full');
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [isDraggingShape, setIsDraggingShape] = useState<boolean>(false);
  const [isDraggingText, setIsDraggingText] = useState<boolean>(false);
  const [isDraggableHover, setIsDraggableHover] = useState<boolean>(false);
  // Shape drag bookkeeping: canvas-space move deltas for the active shape
  const dragShapeRef = useRef<{
    id: string;
    startX: number;             // pointer x in canvas coords at drag start
    startY: number;
    startShapeX: number;        // shape.x at drag start (unpinned shapes)
    startShapeY: number;
    startOffsetX: number;       // pinOffset.x at drag start (pinned shapes)
    startOffsetY: number;
  } | null>(null);
  // Text/caption drag bookkeeping: canvas-space deltas applied to transform.x/y
  const dragTextRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startTransformX: number;
    startTransformY: number;
  } | null>(null);

  // Latest renderComposite for listeners created before it exists (avoids TDZ deps)
  const rerenderRef = useRef<(() => void) | null>(null);

  // Preload video/image DOM elements for composite rendering
  useEffect(() => {
    project.assets.forEach(asset => {
      if (!mediaElementsRef.current.has(asset.id)) {
        if (asset.type === 'image') {
          const img = new Image();
          img.src = asset.url;
          img.onload = () => rerenderRef.current?.();
          mediaElementsRef.current.set(asset.id, img);
        } else if (asset.type === 'video') {
          const vid = document.createElement('video');
          vid.src = asset.url;
          vid.crossOrigin = 'anonymous';
          vid.muted = true;
          vid.preload = 'auto';
          // The first frame (and seeks) must repaint once data is readable,
          // otherwise the monitor stays black until the user hits play.
          vid.addEventListener('loadeddata', () => rerenderRef.current?.());
          vid.addEventListener('seeked', () => rerenderRef.current?.());
          mediaElementsRef.current.set(asset.id, vid);
        }
      }
    });
  }, [project.assets]);

  // Apply Canvas 2D pixel-level effects to a clip region
  const applyCanvas2DEffects = useCallback((ctx: CanvasRenderingContext2D, clip: any, x: number, y: number, w: number, h: number) => {
    if (!clip.appliedEffects) return;

    const videoEffects: AppliedEffect[] = clip.appliedEffects.filter((fx: AppliedEffect) => fx.category === 'video' && fx.enabled);
    if (videoEffects.length === 0) return;

    // Check if any effect needs pixel manipulation
    const needsPixels = videoEffects.some((fx: AppliedEffect) =>
      ['glitch', 'chromaticAberration', 'rgbSplit', 'noise', 'edgeDetect', 'emboss', 'lensFlare', 'mirror', 'vignetteCustom', 'chromaKey', 'posterize'].includes(fx.type)
    );

    if (!needsPixels) return;

    // Grab the clip's pixel data
    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;
    const len = data.length;

    for (const fx of videoEffects) {
      if (fx.type === 'glitch') {
        const amt = (fx.value || 50) / 100;
        const rows = Math.floor(h * amt * 0.3);
        for (let r = 0; r < rows; r++) {
          const ry = Math.floor(Math.random() * h);
          const offset = Math.floor(Math.random() * 20) - 10;
          const srcRow = ry * w * 4;
          const dstRow = srcRow + offset * 4;
          if (dstRow >= 0 && dstRow + w * 4 <= len) {
            for (let i = 0; i < w * 4; i++) {
              data[dstRow + i] = data[srcRow + i];
            }
          }
        }
      } else if (fx.type === 'chromaticAberration') {
        const offset = Math.max(1, Math.round((fx.value || 20) / 10));
        const temp = new Uint8ClampedArray(data);
        for (let i = 0; i < len; i += 4) {
          const xPx = (i / 4) % w;
          const yPx = Math.floor((i / 4) / w);
          // Shift red channel
          const rx = Math.max(0, Math.min(w - 1, xPx + offset));
          const rIdx = ((yPx * w + rx) * 4);
          data[i] = temp[rIdx];
          // Shift blue channel
          const bx = Math.max(0, Math.min(w - 1, xPx - offset));
          const bIdx = ((yPx * w + bx) * 4);
          data[i + 2] = temp[bIdx + 2];
        }
      } else if (fx.type === 'rgbSplit') {
        const ox = Math.max(0, Math.round((fx.value || 10) / 5));
        const temp = new Uint8ClampedArray(data);
        for (let i = 0; i < len; i += 4) {
          const xPx = (i / 4) % w;
          const yPx = Math.floor((i / 4) / w);
          const rx = Math.max(0, Math.min(w - 1, xPx + ox));
          data[i] = temp[((yPx * w + rx) * 4)];
          const bx = Math.max(0, Math.min(w - 1, xPx - ox));
          data[i + 2] = temp[((yPx * w + bx) * 4) + 2];
        }
      } else if (fx.type === 'noise') {
        const amt = (fx.value || 50) / 100;
        for (let i = 0; i < len; i += 4) {
          const n = (Math.random() - 0.5) * amt * 100;
          data[i] = Math.max(0, Math.min(255, data[i] + n));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
        }
      } else if (fx.type === 'edgeDetect') {
        const temp = new Uint8ClampedArray(data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            const gx =
              temp[((y - 1) * w + (x - 1)) * 4] + 2 * temp[(y * w + (x - 1)) * 4] + temp[((y + 1) * w + (x - 1)) * 4] -
              temp[((y - 1) * w + (x + 1)) * 4] - 2 * temp[(y * w + (x + 1)) * 4] - temp[((y + 1) * w + (x + 1)) * 4];
            const gy =
              temp[((y - 1) * w + (x - 1)) * 4] + 2 * temp[((y - 1) * w + x) * 4] + temp[((y - 1) * w + (x + 1)) * 4] -
              temp[((y + 1) * w + (x - 1)) * 4] - 2 * temp[((y + 1) * w + x) * 4] - temp[((y + 1) * w + (x + 1)) * 4];
            const mag = Math.min(255, Math.abs(gx) + Math.abs(gy));
            data[idx] = mag;
            data[idx + 1] = mag;
            data[idx + 2] = mag;
          }
        }
      } else if (fx.type === 'emboss') {
        const temp = new Uint8ClampedArray(data);
        const angle = (Number(fx.params?.angle) || 135) * (Math.PI / 180);
        const height = Math.max(0.1, Number(fx.params?.height) || 2);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            const gx = temp[((y - 1) * w + (x + 1)) * 4] - temp[((y + 1) * w + (x - 1)) * 4];
            const gy = temp[((y - 1) * w + (x - 1)) * 4] - temp[((y + 1) * w + (x + 1)) * 4];
            const val = 128 + (gx * dx + gy * dy) * height;
            const v = Math.max(0, Math.min(255, val));
            data[idx] = v;
            data[idx + 1] = v;
            data[idx + 2] = v;
          }
        }
      } else if (fx.type === 'chromaKey') {
        // AI Background Removal: key out a dominant screen color
        // (green by default — the classic green-screen workflow).
        const tol = Math.max(0.03, Math.min(1, (fx.value || 30) / 100));
        const key = (fx.params?.keyColor as string) === 'blue' ? [0, 0, 255] : [0, 255, 0];
        const temp = new Uint8ClampedArray(data);
        for (let i = 0; i < len; i += 4) {
          const dr = temp[i] - key[0];
          const dg = temp[i + 1] - key[1];
          const db = temp[i + 2] - key[2];
          // Max possible RGB distance is sqrt(3) * 255 ≈ 441.7
          const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
          if (dist < tol * 0.7) {
            data[i + 3] = 0; // fully transparent
          } else if (dist < tol) {
            // Soft transition band so edges don't look cut out
            const soft = (dist - tol * 0.7) / (tol * 0.3);
            data[i + 3] = Math.round(soft * 255);
            // Suppress green spill on semi-keyed pixels
            data[i + 1] = Math.min(data[i + 1], Math.round((temp[i] + temp[i + 2]) / 2));
          }
        }
      } else if (fx.type === 'lensFlare') {
        const flareX = (Number(fx.params?.flareX) || 0.5) * w;
        const flareY = (Number(fx.params?.flareY) || 0.5) * h;
        const intensity = (fx.value || 50) / 100;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const dx = x - flareX;
            const dy = y - flareY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const flare = Math.max(0, 1 - dist / (Math.max(w, h) * 0.5)) * intensity;
            data[idx] = Math.min(255, data[idx] + flare * 255 * 0.8);
            data[idx + 1] = Math.min(255, data[idx + 1] + flare * 255 * 0.6);
            data[idx + 2] = Math.min(255, data[idx + 2] + flare * 255 * 0.4);
          }
        }
      } else if (fx.type === 'posterize') {
        const levels = Math.max(2, Math.min(32, Math.round(fx.value || 6)));
        const step = 255 / (levels - 1);
        for (let i = 0; i < len; i += 4) {
          data[i] = Math.round(data[i] / step) * step;
          data[i + 1] = Math.round(data[i + 1] / step) * step;
          data[i + 2] = Math.round(data[i + 2] / step) * step;
        }
      } else if (fx.type === 'mirror') {
        // Copy one half of the frame over the other (Premiere's Mirror effect)
        const axis = fx.params?.axis === 'h' ? 'h' : 'v';
        if (axis === 'h') {
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < Math.floor(w / 2); x++) {
              const src = (y * w + x) * 4;
              const dst = (y * w + (w - 1 - x)) * 4;
              data[dst] = data[src];
              data[dst + 1] = data[src + 1];
              data[dst + 2] = data[src + 2];
              data[dst + 3] = data[src + 3];
            }
          }
        } else {
          for (let y = 0; y < Math.floor(h / 2); y++) {
            const srcRow = y * w * 4;
            const dstRow = (h - 1 - y) * w * 4;
            for (let x = 0; x < w * 4; x++) data[dstRow + x] = data[srcRow + x];
          }
        }
      } else if (fx.type === 'tint') {
        const hex = ((fx.params?.tintColor as string) || '#ff0000').replace('#', '');
        const tr = parseInt(hex.slice(0, 2), 16) || 255;
        const tg = parseInt(hex.slice(2, 4), 16) || 0;
        const tb = parseInt(hex.slice(4, 6), 16) || 0;
        const amt = Math.max(0, Math.min(1, (fx.value || 50) / 100)) * 0.6;
        for (let i = 0; i < len; i += 4) {
          data[i] = data[i] * (1 - amt) + tr * amt;
          data[i + 1] = data[i + 1] * (1 - amt) + tg * amt;
          data[i + 2] = data[i + 2] * (1 - amt) + tb * amt;
        }
      } else if (fx.type === 'vignetteCustom') {
        const amt = Math.max(0, Math.min(1, (fx.value || 50) / 100));
        const cx = w / 2;
        const cy = h / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const dx = x - cx;
            const dy = y - cy;
            const d = Math.sqrt(dx * dx + dy * dy) / maxDist;
            const darken = 1 - amt * Math.pow(Math.max(0, d - 0.25) / 0.75, 2) * 0.85;
            data[idx] *= darken;
            data[idx + 1] *= darken;
            data[idx + 2] *= darken;
          }
        }
      }
    }

    ctx.putImageData(imgData, x, y);
  }, []);

  // Synchronize composite rendering to canvas on playhead update
  const renderComposite = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const ba = beforeAfterState.enabled;
    const splitX = ba ? Math.round(w * beforeAfterState.splitPosition) : w;

    // Clear and draw black canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Filter active video tracks that are visible
    const visibleVideoTracks = project.tracks.filter(t => t.type === 'video' && t.visible);
    // Sort V1 (bottom) to V3 (top)
    const sortedTracks = [...visibleVideoTracks].sort((a, b) => {
      const numA = parseInt(a.id.replace(/\D/g, '') || '0');
      const numB = parseInt(b.id.replace(/\D/g, '') || '0');
      return numA - numB;
    });

    // Build CSS filter string for real-time Color Grade & Effects
    const buildFilterParts = (clip: any, applyGrade: boolean): string[] => {
      const filterParts: string[] = [];
      if (applyGrade && clip.colorGrade) {
        const g = clip.colorGrade;
        const exp = Math.max(0.1, 1 + (g.exposure || 0) * 0.4);
        const con = Math.max(0.1, 1 + (g.contrast || 0) * 0.01);
        const sat = Math.max(0, (g.saturation ?? 100) * 0.01);
        const tempHue = (g.temperature || 0) * 0.2;
        const hiLift = 1 + (g.highlights || 0) * 0.003;
        const shLift = 1 + (g.shadows || 0) * 0.002;
        const wLift = 1 + (g.whites || 0) * 0.003;
        const bLift = 1 + (g.blacks || 0) * 0.002;
        filterParts.push(`brightness(${(exp * hiLift * shLift * wLift * bLift).toFixed(3)})`);
        filterParts.push(`contrast(${con})`);
        filterParts.push(`saturate(${sat})`);
        if (tempHue !== 0) filterParts.push(`hue-rotate(${tempHue}deg)`);

        if (g.lut === 'Film Noir Monochrome') {
          filterParts.push('grayscale(1) contrast(1.2)');
        } else if (g.lut === 'Vintage Film') {
          filterParts.push('sepia(0.6) contrast(1.1)');
        } else if (g.lut === 'Cinematic Teal & Orange') {
          filterParts.push('contrast(1.2) saturate(1.3) hue-rotate(-10deg)');
        } else if (g.lut === 'Warm Kodak 2383') {
          filterParts.push('sepia(0.25) contrast(1.1) brightness(1.05) saturate(1.2)');
        } else if (g.lut === 'Cyberpunk Neon') {
          filterParts.push('contrast(1.3) saturate(2) hue-rotate(200deg)');
        } else if (g.lut === 'Bleach Bypass') {
          filterParts.push('saturate(0.3) contrast(1.3) brightness(1.1)');
        } else if (g.lut === 'Cross Process') {
          filterParts.push('contrast(1.1) saturate(1.2) hue-rotate(15deg)');
        } else if (g.lut === 'Golden Hour') {
          filterParts.push('sepia(0.15) brightness(1.1) saturate(1.2) hue-rotate(-15deg)');
        } else if (g.lut === 'Midnight') {
          filterParts.push('contrast(1.1) saturate(0.8) hue-rotate(30deg) brightness(0.9)');
        } else if (g.lut === 'Forest') {
          filterParts.push('saturate(1.3) contrast(1.1) hue-rotate(-20deg)');
        } else if (g.lut === 'Desert') {
          filterParts.push('sepia(0.4) contrast(1.1) brightness(1.05)');
        } else if (g.lut === 'Kodachrome') {
          filterParts.push('contrast(1.15) saturate(1.25) brightness(1.02)');
        } else if (g.lut === 'Polaroid') {
          filterParts.push('saturate(0.8) contrast(0.9) brightness(1.05)');
        } else if (g.lut === 'Instagram') {
          filterParts.push('contrast(1.1) saturate(1.15) brightness(1.02)');
        }
      }
      if (clip.appliedEffects) {
        for (const fx of clip.appliedEffects) {
          if (!fx.enabled) continue;
          // Video effects only — audio effects (e.g. Voice Clarity) must never
          // change the picture.
          if (fx.category !== 'video') continue;
          // CSS-filter-friendly effects
          if (fx.type === 'blur') filterParts.push(`blur(${Math.max(1, fx.value / 4)}px)`);
          if (fx.type === 'sharpen') {
            // Canvas has no sharpening filter — approximate with local contrast boost
            filterParts.push(`contrast(${(1 + Math.max(0, fx.value) / 200).toFixed(3)})`);
          }
          if (fx.type === 'contrast') filterParts.push(`contrast(${(1 + fx.value / 100).toFixed(3)})`);
          if (fx.type === 'saturation') filterParts.push(`saturate(${(1 + fx.value / 100).toFixed(3)})`);
          if (fx.type === 'bw') filterParts.push('grayscale(1)');
          if (fx.type === 'sepia') filterParts.push(`sepia(${fx.value / 100})`);
          if (fx.type === 'invert') filterParts.push('invert(1)');
          if (fx.type === 'brightness') filterParts.push(`brightness(${1 + fx.value / 100})`);
          if (fx.type === 'vintage') {
            const amt = Math.max(0, Math.min(1, fx.value / 100));
            filterParts.push(`sepia(${(0.35 * amt).toFixed(2)}) contrast(${(1 + 0.12 * amt).toFixed(2)}) saturate(${(1 - 0.25 * amt).toFixed(2)}) brightness(${(1 + 0.04 * amt).toFixed(2)})`);
          }
          if (fx.type === 'glow') {
            // Real bloom approximation: blur the frame and add it back.
            const amt = Math.max(1, (fx.value || 30) / 4);
            filterParts.push(`blur(${amt.toFixed(1)}px) brightness(${(1 + (fx.value || 30) / 400).toFixed(2)})`);
          }
          if (fx.type === 'posterize') filterParts.push(`contrast(${1 + (fx.value || 4) * 0.5})`);
        }
      }
      return filterParts;
    };

    let renderedAnyClip = false;

    const renderRegion = (startX: number, endX: number, applyGrade: boolean) => {
      const regionW = endX - startX;
      ctx.save();
      ctx.beginPath();
      ctx.rect(startX, 0, regionW, h);
      ctx.clip();

      for (const track of sortedTracks) {
        const activeClips = project.clips.filter(c => {
          return c.trackId === track.id &&
            (c.type === 'video' || c.type === 'image') &&
            playhead >= c.startTime &&
            playhead < c.startTime + c.duration;
        });

        for (const clip of activeClips) {
          const el = mediaElementsRef.current.get(clip.assetId);
          if (!el) continue;

          ctx.save();

          // Calculate clip source time
          const timeOffset = playhead - clip.startTime;
          const sourceTime = clip.inPoint + timeOffset * clip.speed;

          if (el instanceof HTMLVideoElement) {
            if (Math.abs(el.currentTime - sourceTime) > 0.08) {
              el.currentTime = sourceTime;
            }
          }

          ctx.globalAlpha = Math.max(0, Math.min(1, clip.opacity));

          // Motion effects: camera shake jitter + slow zoom progress
          let extraScale = 1;
          let jitterX = 0;
          let jitterY = 0;
          const clipEffectList = (clip.appliedEffects || []) as AppliedEffect[];
          for (const fx of clipEffectList) {
            if (!fx.enabled) continue;
            if (fx.type === 'cameraShake') {
              // Smooth pseudo-random handheld wobble driven by the playhead
              const amt = ((fx.value || 30) / 100) * 8;
              jitterX = amt * (Math.sin(playhead * 43.1) * 0.6 + Math.sin(playhead * 17.7) * 0.4);
              jitterY = amt * (Math.cos(playhead * 31.3) * 0.55 + Math.cos(playhead * 11.9) * 0.45);
            } else if (fx.type === 'slowZoom') {
              // 0% → no zoom, 100% of clip time reaching full value
              const prog = Math.min(1, Math.max(0, (playhead - clip.startTime) / Math.max(0.1, clip.duration)));
              extraScale = 1 + ((fx.value || 15) / 100) * prog;
            }
          }

          // Center origin for transforms (relative to region)
          ctx.translate(startX + regionW / 2 + clip.transform.x + jitterX, h / 2 + clip.transform.y + jitterY);
          ctx.rotate((clip.transform.rotation * Math.PI) / 180);
          const totalScale = clip.transform.scale * extraScale;
          ctx.scale(totalScale, totalScale);

          const srcW = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || w;
          const srcH = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || h;
          const scaleFit = Math.min(regionW / srcW, h / srcH);
          const drawW = srcW * scaleFit;
          const drawH = srcH * scaleFit;

          const filterParts = buildFilterParts(clip, applyGrade);
          ctx.filter = filterParts.length > 0 ? filterParts.join(' ') : 'none';

          if (clip.textProperties) {
            const tp = clip.textProperties;
            ctx.font = `bold ${tp.fontSize}px ${tp.fontFamily || 'Inter, sans-serif'}`;
            ctx.textAlign = tp.align || 'center';
            ctx.textBaseline = 'middle';
            const lines = tp.text.split('\n');
            const lineHeight = tp.fontSize * 1.25;
            const totalTextHeight = lines.length * lineHeight;

            if (tp.backgroundColor) {
              ctx.save();
              ctx.filter = 'none';
              ctx.fillStyle = tp.backgroundColor;
              let maxWidth = 0;
              lines.forEach(l => {
                const m = ctx.measureText(l);
                if (m.width > maxWidth) maxWidth = m.width;
              });
              const padX = 32;
              const padY = 18;
              const boxX = tp.align === 'center' ? -maxWidth / 2 - padX : tp.align === 'left' ? -padX : -maxWidth - padX;
              ctx.fillRect(boxX, -totalTextHeight / 2 - padY, maxWidth + padX * 2, totalTextHeight + padY * 2);
              ctx.restore();
            }

            lines.forEach((line, lineIdx) => {
              const lineY = -totalTextHeight / 2 + (lineIdx + 0.5) * lineHeight;
              if (tp.strokeColor && tp.strokeWidth) {
                ctx.lineWidth = tp.strokeWidth;
                ctx.strokeStyle = tp.strokeColor;
                ctx.strokeText(line, 0, lineY);
              }
              ctx.fillStyle = tp.color || '#ffffff';
              ctx.fillText(line, 0, lineY);
            });
            renderedAnyClip = true;
          } else {
            try {
              ctx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
              renderedAnyClip = true;

              // Apply Canvas 2D pixel effects to the drawn clip region
              // (account for transform scale, extra zoom and shake jitter)
              const finalDrawW = drawW * totalScale;
              const finalDrawH = drawH * totalScale;
              const clipX = startX + (regionW - finalDrawW) / 2 + jitterX;
              const clipY = (h - finalDrawH) / 2 + jitterY;

              // Real color engine: curves / color wheels / HSL secondary
              if (clip.colorGrade && gradeNeedsPixels(clip.colorGrade)) {
                processClipRegion(
                  ctx,
                  Math.max(0, Math.floor(clipX)), Math.max(0, Math.floor(clipY)),
                  Math.min(Math.ceil(finalDrawW), w - Math.floor(clipX)),
                  Math.min(Math.ceil(finalDrawH), h - Math.floor(clipY)),
                  clip.colorGrade,
                );
              }

              applyCanvas2DEffects(ctx, clip, Math.max(0, Math.floor(clipX)), Math.max(0, Math.floor(clipY)), Math.min(Math.ceil(finalDrawW), w - Math.floor(clipX)), Math.min(Math.ceil(finalDrawH), h - Math.floor(clipY)));
            } catch (e) {
              // Frame not ready yet
            }
          }

          ctx.restore();
        }
      }

      ctx.restore();
    };

    if (ba) {
      // Before (no grade) on left
      renderRegion(0, splitX, false);
      // After (with grade) on right
      renderRegion(splitX, w, true);

      // Split line
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BEFORE', splitX / 2, 30);
      ctx.fillText('AFTER', (splitX + w) / 2, 30);
      ctx.restore();
    } else {
      renderRegion(0, w, true);
    }

    // Vignette overlay (applied only on After side or full if not BA)
    if (!ba) {
      const vignetteClip = project.clips.find(c => {
        return (c.type === 'video' || c.type === 'image') &&
          playhead >= c.startTime && playhead < c.startTime + c.duration &&
          (c.colorGrade?.vignette || 0) > 0;
      });
      if (vignetteClip?.colorGrade?.vignette) {
        ctx.save();
        ctx.filter = 'none';
        const vigAmount = vignetteClip.colorGrade.vignette / 100;
        const gradient = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${(vigAmount * 0.85).toFixed(2)})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // Safe Margins overlay (Action 90%, Title 80%)
    if (safeMargins) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#00e5ff88';
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
      ctx.strokeStyle = '#ffd60088';
      ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
      ctx.strokeStyle = '#ffffff66';
      ctx.beginPath();
      ctx.moveTo(w / 2 - 10, h / 2);
      ctx.lineTo(w / 2 + 10, h / 2);
      ctx.moveTo(w / 2, h / 2 - 10);
      ctx.lineTo(w / 2, h / 2 + 10);
      ctx.stroke();
      ctx.restore();
    }

    // --- Shape Layers (Graphics) ---
    shapeLayers.forEach(shape => {
      // Apply pin position
      const base = shapeBasePos(shape, w, h);
      const drawX = base.x;
      const drawY = base.y;

      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.rotate((shape.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, Math.min(1, shape.opacity));

      if (shape.type === 'rectangle') {
        ctx.fillStyle = shape.fillColor;
        ctx.globalAlpha = Math.max(0, Math.min(1, shape.fillOpacity));
        ctx.beginPath();
        ctx.roundRect(0, 0, shape.width, shape.height, shape.cornerRadius);
        ctx.fill();
        if (shape.strokeColor && shape.strokeWidth > 0) {
          ctx.strokeStyle = shape.strokeColor;
          ctx.lineWidth = shape.strokeWidth;
          ctx.stroke();
        }
      } else if (shape.type === 'circle' || shape.type === 'ellipse') {
        ctx.fillStyle = shape.fillColor;
        ctx.globalAlpha = Math.max(0, Math.min(1, shape.fillOpacity));
        ctx.beginPath();
        const rx = shape.width / 2;
        const ry = shape.height / 2;
        ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        if (shape.strokeColor && shape.strokeWidth > 0) {
          ctx.strokeStyle = shape.strokeColor;
          ctx.lineWidth = shape.strokeWidth;
          ctx.stroke();
        }
      } else if (shape.type === 'line') {
        ctx.strokeStyle = shape.fillColor;
        ctx.lineWidth = shape.strokeWidth || 2;
        ctx.globalAlpha = Math.max(0, Math.min(1, shape.fillOpacity));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(shape.width, shape.height);
        ctx.stroke();
      } else if (shape.type === 'arrow') {
        ctx.strokeStyle = shape.fillColor;
        ctx.fillStyle = shape.fillColor;
        ctx.lineWidth = shape.strokeWidth || 2;
        ctx.globalAlpha = Math.max(0, Math.min(1, shape.fillOpacity));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(shape.width, shape.height);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(shape.height, shape.width);
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(shape.width, shape.height);
        ctx.lineTo(shape.width - headLen * Math.cos(angle - Math.PI / 6), shape.height - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(shape.width, shape.height);
        ctx.lineTo(shape.width - headLen * Math.cos(angle + Math.PI / 6), shape.height - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(shape.width - headLen * Math.cos(angle - Math.PI / 6), shape.height - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(shape.width, shape.height);
        ctx.lineTo(shape.width - headLen * Math.cos(angle + Math.PI / 6), shape.height - headLen * Math.sin(angle + Math.PI / 6));
        ctx.fill();
      }

      ctx.restore();

      // Selection outline for the shape being edited
      if (selectedShapeId === shape.id) {
        ctx.save();
        ctx.strokeStyle = '#1473e6';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(drawX - 4, drawY - 4, shape.width + 8, shape.height + 8);
        ctx.setLineDash([]);
        ctx.restore();
      }
    });

    // --- Text Animations for active title clips ---
    const now = playhead;
    project.clips.forEach(clip => {
      if (!clip.textProperties) return;
      const anim = textAnimations.find(a => a.enabled);
      if (!anim) return;

      // Calculate animation progress (0 to 1)
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      if (now < clipStart || now > clipEnd) return;
      const progress = Math.min(1, Math.max(0, (now - clipStart - anim.delay) / anim.duration));

      // Apply animation transform
      ctx.save();
      let alpha = 1;
      let offsetX = 0;
      let offsetY = 0;
      let scale = 1;

      switch (anim.type) {
        case 'fade-in':
          alpha = progress;
          break;
        case 'fade-out':
          alpha = 1 - progress;
          break;
        case 'slide-left':
          offsetX = -w * (1 - progress);
          break;
        case 'slide-right':
          offsetX = w * (1 - progress);
          break;
        case 'slide-up':
          offsetY = -h * (1 - progress);
          break;
        case 'slide-down':
          offsetY = h * (1 - progress);
          break;
        case 'scale-up':
          scale = 0.5 + 0.5 * progress;
          break;
        case 'blur-in':
          ctx.filter = `blur(${Math.max(0, 10 * (1 - progress))}px)`;
          alpha = progress;
          break;
        case 'typewriter':
          // Handled in text rendering below
          break;
        case 'bounce':
          scale = 1 + Math.sin(progress * Math.PI) * 0.2;
          break;
        case 'glitch':
          // Subtle offset
          offsetX = (Math.random() - 0.5) * 4 * (1 - progress);
          offsetY = (Math.random() - 0.5) * 4 * (1 - progress);
          break;
        case 'kinetic':
          offsetX = Math.sin(progress * Math.PI * 4) * 10;
          break;
      }

      ctx.globalAlpha = alpha;
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Restore will happen after text rendering in the clip loop
      ctx.restore();
      // Note: animation transform is applied globally here for simplicity;
      // per-clip animation would need to be integrated into the clip draw loop.
    });

    // If empty sequence, draw subtle grid/text
    if (!renderedAnyClip && project.clips.length === 0) {
      ctx.fillStyle = '#333333';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Drag clips to timeline or double-click to preview', w / 2, h / 2);
    }
  }, [project.tracks, project.clips, project.width, project.height, playhead, safeMargins, beforeAfterState, shapeLayers, selectedShapeId, textAnimations, applyCanvas2DEffects]);

  useEffect(() => {
    renderComposite();
  }, [renderComposite]);
  rerenderRef.current = () => renderComposite();

  /* ---------- Shape dragging (mouse position control, Essential Graphics) ---------- */

  // Convert a mouse event to canvas-internal coordinates (canvas uses CSS scaling)
  const canvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  };

  // Topmost shape containing the point (checked in reverse draw order)
  const hitTestShape = (px: number, py: number): ShapeLayer | null => {
    for (let i = shapeLayers.length - 1; i >= 0; i--) {
      const shape = shapeLayers[i];
      const base = shapeBasePos(shape, canvasRef.current?.width ?? 1920, canvasRef.current?.height ?? 1080);
      // Transform into the shape's local (rotated) space
      const rad = -(shape.rotation * Math.PI) / 180;
      const dx = px - (base.x + shape.width / 2);
      const dy = py - (base.y + shape.height / 2);
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (lx >= -shape.width / 2 && lx <= shape.width / 2 && ly >= -shape.height / 2 && ly <= shape.height / 2) {
        return shape;
      }
    }
    return null;
  };

  // Topmost active text/caption clip whose rendered text box contains the point.
  const hitTestText = (px: number, py: number, ctx: CanvasRenderingContext2D): TimelineClip | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const visibleTrackIds = new Set(
      project.tracks.filter(t => t.type === 'video' && t.visible).map(t => t.id)
    );
    const activeTextClips = project.clips
      .filter(c =>
        c.textProperties &&
        visibleTrackIds.has(c.trackId) &&
        playhead >= c.startTime &&
        playhead < c.startTime + c.duration
      )
      .sort((a, b) =>
        parseInt(b.trackId.replace(/\D/g, '') || '0', 10) -
        parseInt(a.trackId.replace(/\D/g, '') || '0', 10)
      );

    for (const clip of activeTextClips) {
      const tp = clip.textProperties!;
      const scale = Math.max(0.01, Math.abs(clip.transform.scale || 1));
      const rad = -(clip.transform.rotation * Math.PI) / 180;
      const dx = px - (canvas.width / 2 + clip.transform.x);
      const dy = py - (canvas.height / 2 + clip.transform.y);
      const localX = (dx * Math.cos(rad) - dy * Math.sin(rad)) / scale;
      const localY = (dx * Math.sin(rad) + dy * Math.cos(rad)) / scale;

      ctx.save();
      ctx.font = `bold ${tp.fontSize}px ${tp.fontFamily || 'Inter, sans-serif'}`;
      const textLines = tp.text.split('\n');
      let maxWidth = 1;
      textLines.forEach(line => {
        maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
      });
      ctx.restore();

      const lineHeight = tp.fontSize * 1.25;
      const totalTextHeight = Math.max(1, textLines.length) * lineHeight;
      const padX = tp.backgroundColor ? 32 : 10;
      const padY = tp.backgroundColor ? 18 : 10;
      const left = tp.align === 'left' ? -padX : tp.align === 'right' ? -maxWidth - padX : -maxWidth / 2 - padX;
      const right = left + maxWidth + padX * 2;
      const top = -totalTextHeight / 2 - padY;
      const bottom = totalTextHeight / 2 + padY;

      if (localX >= left && localX <= right && localY >= top && localY <= bottom) {
        return clip;
      }
    }
    return null;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (beforeAfterState.enabled) return;
    const { x: px, y: py } = canvasPoint(e);

    const shape = hitTestShape(px, py);
    if (shape) {
      e.preventDefault();
      setSelectedShapeId(shape.id);
      dragShapeRef.current = {
        id: shape.id,
        startX: px,
        startY: py,
        startShapeX: shape.x,
        startShapeY: shape.y,
        startOffsetX: shape.pinOffset?.x ?? 0,
        startOffsetY: shape.pinOffset?.y ?? 0,
      };
      setIsDraggingShape(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const ctx = canvasRef.current?.getContext('2d');
    const textClip = ctx ? hitTestText(px, py, ctx) : null;
    if (!textClip) return;

    e.preventDefault();
    setSelectedShapeId(null);
    setSelectedClipId(textClip.id);
    dragTextRef.current = {
      id: textClip.id,
      startX: px,
      startY: py,
      startTransformX: textClip.transform.x,
      startTransformY: textClip.transform.y,
    };
    setIsDraggingText(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const shapeDrag = dragShapeRef.current;
    if (shapeDrag) {
      const { x: px, y: py } = canvasPoint(e);
      const deltaX = Math.round((px - shapeDrag.startX) * 100) / 100;
      const deltaY = Math.round((py - shapeDrag.startY) * 100) / 100;
      const shape = shapeLayers.find(s => s.id === shapeDrag.id);
      if (!shape) return;
      if (shape.pin !== 'none') {
        // Pinned shapes keep their pin and move through the offset
        updateShapeLayer(shape.id, {
          pinOffset: {
            x: Math.round((shapeDrag.startOffsetX + deltaX) * 100) / 100,
            y: Math.round((shapeDrag.startOffsetY + deltaY) * 100) / 100,
          },
        });
      } else {
        updateShapeLayer(shape.id, {
          x: Math.round((shapeDrag.startShapeX + deltaX) * 100) / 100,
          y: Math.round((shapeDrag.startShapeY + deltaY) * 100) / 100,
        });
      }
      return;
    }

    const textDrag = dragTextRef.current;
    if (textDrag) {
      const { x: px, y: py } = canvasPoint(e);
      const clip = project.clips.find(c => c.id === textDrag.id);
      if (!clip) return;
      updateClipProperties(textDrag.id, {
        transform: {
          ...clip.transform,
          x: Math.round(textDrag.startTransformX + (px - textDrag.startX)),
          y: Math.round(textDrag.startTransformY + (py - textDrag.startY)),
        },
      });
      return;
    }

    if (!beforeAfterState.enabled) {
      const { x: px, y: py } = canvasPoint(e);
      const ctx = canvasRef.current?.getContext('2d');
      const overDraggable = !!hitTestShape(px, py) || (ctx ? !!hitTestText(px, py, ctx) : false);
      if (overDraggable !== isDraggableHover) setIsDraggableHover(overDraggable);
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    let releasedDrag = false;
    if (dragShapeRef.current) {
      dragShapeRef.current = null;
      setIsDraggingShape(false);
      releasedDrag = true;
    }
    if (dragTextRef.current) {
      dragTextRef.current = null;
      setIsDraggingText(false);
      releasedDrag = true;
    }
    if (releasedDrag) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-[#2d2d2d] overflow-hidden select-none">
      {/* Program Header */}
      <div className="flex items-center justify-between px-3 h-7 bg-[#252525] border-b border-[#2d2d2d] text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">Program: {project.name}</span>
          <span className="text-gray-400 font-mono text-[11px] bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#333]">
            {project.width}x{project.height}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Safe margins toggle */}
          <button
            onClick={() => setSafeMargins(prev => !prev)}
            title="Toggle Safe Margins (80% / 90%)"
            className={`p-1 rounded transition ${safeMargins ? 'bg-[#1473e6] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          {/* Before / After toggle */}
          <button
            onClick={toggleBeforeAfter}
            title="Toggle Before / After Comparison"
            className={`p-1 rounded transition ${beforeAfterState.enabled ? 'bg-[#1473e6] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Resolution selector */}
          <select
            value={playbackRes}
            onChange={e => setPlaybackRes(e.target.value as 'Full' | '1/2' | '1/4')}
            className="bg-[#181818] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
          >
            <option value="Full">Full</option>
            <option value="1/2">1/2</option>
            <option value="1/4">1/4</option>
          </select>

          {/* Multicamera Angle Selector */}
          {multicamSequences.length > 0 && (
            <div className="flex items-center space-x-1 ml-2">
              <span className="text-[10px] text-gray-400">CAM:</span>
              <select
                value={activeMulticamId || 'none'}
                onChange={e => {
                  const seq = multicamSequences[0];
                  if (seq) {
                    setMulticamActiveAngle(seq.id, e.target.value === 'none' ? null : e.target.value);
                  }
                }}
                className="bg-[#181818] border border-[#3a3a3a] rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
              >
                <option value="none">Multi-Cam</option>
                {multicamSequences[0]?.angles.map((angle: MulticamAngle) => (
                  <option key={angle.id} value={angle.id}>
                    {angle.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Program Canvas Viewport */}
      <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          width={project.width}
          height={project.height}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerLeave={() => {
            if (!dragShapeRef.current && !dragTextRef.current) setIsDraggableHover(false);
          }}
          className={`max-h-full max-w-full object-contain shadow-2xl rounded-xs border border-[#222] ${
            isDraggingShape || isDraggingText
              ? 'cursor-grabbing'
              : isDraggableHover
                ? 'cursor-grab'
                : 'cursor-default'
          }`}
        />
      </div>

      {/* Program Transport & Timecode Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1e1e1e] border-t border-[#2a2a2a] text-xs">
        {/* Left: Interactive Timecode Display */}
        <div className="flex items-center space-x-2">
          <div 
            title="Current Timecode (HH:MM:SS:FF)"
            className="bg-[#141414] border border-[#353535] rounded px-2.5 py-1 text-sm font-mono font-bold text-[#2680eb] tracking-wider shadow-inner"
          >
            {formatTimecode(playhead, project.fps)}
          </div>
          <span className="text-gray-500 font-mono text-[11px]">
            / {formatTimecode(project.duration, project.fps)}
          </span>
        </div>

        {/* Center: Main Transport Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => seek(0)}
            title="Go to Start (Home)"
            className="p-1.5 hover:bg-[#2e2e2e] rounded text-gray-400 hover:text-white"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => stepFrames(-1)}
            title="Step Back 1 Frame (Left Arrow)"
            className="px-2 py-1 hover:bg-[#2e2e2e] rounded font-mono font-bold text-gray-300 text-xs"
          >
            -1f
          </button>

          <button
            onClick={togglePlay}
            title="Play / Pause (Spacebar)"
            className="px-4 py-1.5 bg-[#1473e6] hover:bg-[#2680eb] rounded text-white shadow flex items-center justify-center transition active:scale-95"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={() => stepFrames(1)}
            title="Step Forward 1 Frame (Right Arrow)"
            className="px-2 py-1 hover:bg-[#2e2e2e] rounded font-mono font-bold text-gray-300 text-xs"
          >
            +1f
          </button>

          <button
            onClick={() => seek(project.duration)}
            title="Go to End (End)"
            className="p-1.5 hover:bg-[#2e2e2e] rounded text-gray-400 hover:text-white"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Quick sequence actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsLooping(p => !p)}
            title="Loop Playback"
            className={`p-1.5 rounded transition ${isLooping ? 'bg-[#1473e6] text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
