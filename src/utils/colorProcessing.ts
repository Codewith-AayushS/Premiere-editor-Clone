import type { CurvePoint, EnhancedColorGrade, ColorWheels, RGBACurves } from '../types/editor';

/**
 * Neutral baseline grade. Clips start here; "Remove Look" resets back to it.
 */
export const DEFAULT_GRADE: EnhancedColorGrade = {
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 100,
  vignette: 0,
  lut: 'None',
  curves: {
    master: [
      { x: 0, y: 0 }, { x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.75 }, { x: 1, y: 1 },
    ],
    red: [
      { x: 0, y: 0 }, { x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.75 }, { x: 1, y: 1 },
    ],
    green: [
      { x: 0, y: 0 }, { x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.75 }, { x: 1, y: 1 },
    ],
    blue: [
      { x: 0, y: 0 }, { x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.75 }, { x: 1, y: 1 },
    ],
  },
  wheels: {
    shadows: { angle: 0, magnitude: 0 },
    midtones: { angle: 0, magnitude: 0 },
    highlights: { angle: 0, magnitude: 0 },
    global: { angle: 0, magnitude: 0 },
  },
  hslSecondary: {
    enabled: false,
    hue: 0,
    hueRange: 50,
    saturation: 0,
    satRange: 50,
    luminance: 0,
    lumRange: 50,
    temp: 0,
    tint: 0,
    exposure: 0,
    contrast: 0,
    saturationAdj: 0,
  },
};

/**
 * Real color engine for the Program Monitor preview.
 *
 * Everything the Lumetri panel exposes — Curves, Color Wheels,
 * HSL Secondary and the Hue vs Sat / Hue vs Hue curves — is executed here
 * with a per-pixel pass, and the backend implements the same math with
 * FFmpeg filters so the export matches the preview.
 */

export interface CompleteGrade extends EnhancedColorGrade {
  curves: RGBACurves;
  wheels: ColorWheels;
}

interface HslSecondaryFull {
  enabled: boolean;
  hue: number;
  hueRange: number;
  saturation: number;
  satRange: number;
  luminance: number;
  lumRange: number;
  temp: number;
  tint: number;
  exposure: number;
  contrast: number;
  saturationAdj: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Monotone evaluation of a curve (points sorted by x) into a 256-entry LUT. */
function buildCurveLut(points: CurvePoint[]): Uint8Array | null {
  if (!points || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  // True identity (two corner points) → nothing to do
  if (sorted.length === 2 && sorted[0].x === 0 && sorted[0].y === 0 && sorted[1].x === 1 && sorted[1].y === 1) {
    return null;
  }
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    if (x <= sorted[0].x) {
      hi = sorted.length > 1 ? sorted[1] : sorted[0];
    } else if (x >= sorted[sorted.length - 1].x) {
      lo = hi;
    } else {
      for (let p = 0; p < sorted.length - 1; p++) {
        if (x >= sorted[p].x && x <= sorted[p + 1].x) { lo = sorted[p]; hi = sorted[p + 1]; break; }
      }
    }
    const t = hi.x === lo.x ? 0 : (x - lo.x) / (hi.x - lo.x);
    lut[i] = clamp(Math.round((lo.y + (hi.y - lo.y) * t) * 255), 0, 255);
  }
  return lut;
}

/** Hue-wheel (angle°, magnitude) → signed RGB offsets. Shared with the server. */
export function hueWheelRgb(angleDeg: number, magnitude: number): { r: number; g: number; b: number } {
  const m = clamp(magnitude, 0, 100) / 100;
  const h = (((angleDeg % 360) + 360) % 360) / 60; // 0..6
  const sector = Math.floor(h);
  const frac = h - sector;
  let r = 0, g = 0, b = 0;
  switch (sector) {
    case 0: r = 1; g = frac; break;
    case 1: r = 1 - frac; g = 1; break;
    case 2: g = 1; b = frac; break;
    case 3: g = 1 - frac; b = 1; break;
    case 4: r = frac; b = 1; break;
    default: r = 1; b = 1 - frac; break;
  }
  const to = (c: number) => (c - 0.5) * 2 * m;
  return { r: to(r), g: to(g), b: to(b) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  switch (Math.floor(hp)) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    default: r = c; b = x; break;
  }
  const m = l - c / 2;
  return [clamp(r + m, 0, 1), clamp(g + m, 0, 1), clamp(b + m, 0, 1)];
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Soft mask (0..1) for the HSL secondary selection. */
function hslSelectMask(h: number, s: number, l: number, hsl: HslSecondaryFull): number {
  const hueR = clamp(hsl.hueRange, 0, 100) / 100 * 180;
  if (hueR <= 0.02) return 0;
  const hd = hueDistance(h, hsl.hue);
  const hMask = hd >= hueR ? 0 : 1 - hd / hueR;

  const satR = clamp(hsl.satRange, 0, 100) / 100;
  const sMask = satR >= 1 ? 1 : clamp(1 - Math.abs(s - clamp(hsl.saturation, 0, 100) / 100) / Math.max(0.02, satR), 0, 1);

  const lumR = clamp(hsl.lumRange, 0, 100) / 100;
  const lMask = lumR >= 1 ? 1 : clamp(1 - Math.abs(l - clamp(hsl.luminance, 0, 100) / 100) / Math.max(0.02, lumR), 0, 1);

  return hMask * sMask * lMask;
}

/** True when a grade contains any advanced processing worth a pixel pass. */
export function gradeNeedsPixels(grade: EnhancedColorGrade): boolean {
  const g = grade as Partial<CompleteGrade>;
  if (g.curves) {
    const c = g.curves;
    if (buildCurveLut(c.master) || buildCurveLut(c.red) || buildCurveLut(c.green) || buildCurveLut(c.blue)) return true;
  }
  if (g.wheels) {
    for (const w of [g.wheels.shadows, g.wheels.midtones, g.wheels.highlights, g.wheels.global]) {
      if (w && (w.magnitude ?? 0) > 0) return true;
    }
  }
  const hsl = g.hslSecondary;
  if (hsl?.enabled) {
    if ((hsl.saturationAdj ?? 0) !== 0 || (hsl.exposure ?? 0) !== 0 ||
      (hsl.temp ?? 0) !== 0 || (hsl.tint ?? 0) !== 0 || (hsl.luminance ?? 0) !== 0 ||
      (hsl.saturation ?? 0) !== 0) return true;
  }
  if (g.hueVsSat && g.hueVsSat.length > 2) return true;
  if (g.hueVsHue && g.hueVsHue.length > 2) return true;
  return false;
}

function buildHueLut(points: CurvePoint[]): Float32Array {
  const lut = new Float32Array(360).fill(0.5);
  if (!points || points.length === 0) return lut;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (let d = 0; d < 360; d++) {
    const xx = d / 360;
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    if (xx <= sorted[0].x) {
      hi = sorted.length > 1 ? sorted[1] : sorted[0];
    } else if (xx >= sorted[sorted.length - 1].x) {
      lo = hi;
    } else {
      for (let p = 0; p < sorted.length - 1; p++) {
        if (xx >= sorted[p].x && xx <= sorted[p + 1].x) { lo = sorted[p]; hi = sorted[p + 1]; break; }
      }
    }
    const t = hi.x === lo.x ? 0 : (xx - lo.x) / (hi.x - lo.x);
    lut[d] = lo.y + (hi.y - lo.y) * t;
  }
  return lut;
}

/**
 * Applies curves / color wheels / HSL secondary / hue-vs curves to the
 * pixels of a clip region (x, y, w, h in canvas coordinates).
 */
export function processClipRegion(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  grade: EnhancedColorGrade,
): void {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  if (x < 0 || y < 0 || x + width > ctx.canvas.width || y + height > ctx.canvas.height) return;

  const img = ctx.getImageData(x, y, width, height);
  const data = img.data;
  const g = grade as CompleteGrade & { hslSecondary?: Partial<HslSecondaryFull>; hueVsSat?: CurvePoint[]; hueVsHue?: CurvePoint[] };

  const luts = {
    m: g.curves ? buildCurveLut(g.curves.master) : null,
    r: g.curves ? buildCurveLut(g.curves.red) : null,
    gr: g.curves ? buildCurveLut(g.curves.green) : null,
    b: g.curves ? buildCurveLut(g.curves.blue) : null,
  };

  const wTr = g.wheels ? hueWheelRgb(+g.wheels.shadows.angle, +g.wheels.shadows.magnitude) : null;
  const wMd = g.wheels ? hueWheelRgb(+g.wheels.midtones.angle, +g.wheels.midtones.magnitude) : null;
  const wHi = g.wheels ? hueWheelRgb(+g.wheels.highlights.angle, +g.wheels.highlights.magnitude) : null;
  const wGl = g.wheels ? hueWheelRgb(+g.wheels.global.angle, +g.wheels.global.magnitude) : null;

  const hsl = g.hslSecondary?.enabled
    ? {
      enabled: true, hue: +g.hslSecondary.hue, hueRange: +g.hslSecondary.hueRange,
      saturation: +g.hslSecondary.saturation, satRange: +g.hslSecondary.satRange,
      luminance: +g.hslSecondary.luminance, lumRange: +g.hslSecondary.lumRange,
      temp: +g.hslSecondary.temp, tint: +g.hslSecondary.tint,
      exposure: +g.hslSecondary.exposure, contrast: +g.hslSecondary.contrast,
      saturationAdj: +g.hslSecondary.saturationAdj,
    }
    : null;

  // Hue-vs lookup tables (360 entries, y in 0..1)
  const satLut = g.hueVsSat && g.hueVsSat.length > 2 ? buildHueLut(g.hueVsSat) : null;
  const hueLut = g.hueVsHue && g.hueVsHue.length > 2 ? buildHueLut(g.hueVsHue) : null;

  const hasWheels = !!(wTr || wMd || wHi || wGl);
  const WHEEL_GAIN = 62; // offset in 0-255 units at full magnitude

  for (let i = 0; i < data.length; i += 4) {
    let r: number = data[i];
    let gg: number = data[i + 1];
    let b: number = data[i + 2];

    /* Curves (per-channel LUTs) */
    if (luts.m) { r = luts.m[r]; gg = luts.m[gg]; b = luts.m[b]; }
    if (luts.r) r = luts.r[r];
    if (luts.gr) gg = luts.gr[gg];
    if (luts.b) b = luts.b[b];

    if (hasWheels || hsl || satLut || hueLut) {
      const rl = r / 255, gl = gg / 255, bl = b / 255;
      const hslBase = rgbToHsl(rl, gl, bl);
      let h = hslBase.h;
      let s = hslBase.s;

      /* Color wheels — luminance-zone weighted offsets */
      if (hasWheels) {
        const l0 = hslBase.l;
        const sh = 1 - smoothstep(0.16, 0.62, l0);
        const hi = smoothstep(0.38, 0.86, l0);
        const md = 1 - Math.min(1, sh + hi);
        let or_ = 0, og = 0, ob = 0;
        if (wTr) { or_ += wTr.r * sh; og += wTr.g * sh; ob += wTr.b * sh; }
        if (wMd) { or_ += wMd.r * md; og += wMd.g * md; ob += wMd.b * md; }
        if (wHi) { or_ += wHi.r * hi; og += wHi.g * hi; ob += wHi.b * hi; }
        if (wGl) { or_ += wGl.r; og += wGl.g; ob += wGl.b; }
        r = clamp(r + or_ * WHEEL_GAIN, 0, 255);
        gg = clamp(gg + og * WHEEL_GAIN, 0, 255);
        b = clamp(b + ob * WHEEL_GAIN, 0, 255);
      }

      /* HSL Secondary — corrections applied only inside the selected range */
      if (hsl) {
        const mask = hslSelectMask(h, s, hslBase.l, hsl);
        if (mask > 0.002) {
          const satAdj = hsl.saturationAdj / 100;
          if (satAdj !== 0) {
            s = clamp(s * (1 + satAdj), 0, 1);
            const conv = hslToRgb(h, s, hslBase.l);
            r = conv[0] * 255; gg = conv[1] * 255; b = conv[2] * 255;
          }
          const expF = 1 + (hsl.exposure / 100) * 0.35 * mask;
          const tempF = (hsl.temp / 100) * 0.25 * mask;
          const tintF = (hsl.tint / 100) * 0.25 * mask;
          r = clamp(r * expF + tempF * 35, 0, 255);
          gg = clamp(gg * expF, 0, 255);
          b = clamp(b * expF - tempF * 35 + tintF * 35, 0, 255);
        }
      }

      /* Hue vs Saturation / Hue vs Hue curves */
      if (satLut || hueLut) {
        const hd = Math.round((h % 360 + 360) % 360) % 360;
        if (hueLut) h = hueLut[hd] * 360;
        if (satLut) s = clamp(s * (0.5 + satLut[hd] * 2), 0, 1);
        const conv = hslToRgb(h, s, hslBase.l);
        r = conv[0] * 255; gg = conv[1] * 255; b = conv[2] * 255;
      }
    }

    data[i] = Math.round(r); data[i + 1] = Math.round(gg); data[i + 2] = Math.round(b);
  }

  ctx.putImageData(img, x, y);
}
