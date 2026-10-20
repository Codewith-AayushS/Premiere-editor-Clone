import type { AppliedEffect, EnhancedColorGrade } from '../types/editor';

/**
 * AI-style Magic Edit prompt engine.
 * Parses a natural-language description and returns a concrete editing plan
 * (color grade, effects, speed) that maps onto the real effect pipeline,
 * exactly the way the user typed. 100% deterministic so previews and
 * FFmpeg exports stay in sync.
 */

export type MagicEffect = Omit<AppliedEffect, 'id'>;

export interface MagicEditPlan {
  labels: string[];
  grade?: Partial<EnhancedColorGrade>;
  effects?: MagicEffect[];
  speed?: number;
}

type MagicEffectType = AppliedEffect['type'];

const BASE_CINEMATIC: Partial<EnhancedColorGrade> = {
  contrast: 12,
  saturation: 106, // grade saturation is a PERCENT around 100, not a delta
  vignette: 22,
  highlights: -8,
  shadows: -4,
};

export function planMagicEdit(prompt: string): MagicEditPlan {
  const q = prompt.toLowerCase();
  const labels: string[] = [];
  const grade: Partial<EnhancedColorGrade> = { ...BASE_CINEMATIC };
  const effects: MagicEffect[] = [];
  let speed: number | undefined;
  let matched = false;

  const addGrade = (part: Partial<EnhancedColorGrade>, label: string) => {
    matched = true;
    Object.assign(grade, part);
    labels.push(label);
  };

  const addEffect = (type: MagicEffectType, name: string, value: number, params?: MagicEffect['params'], label?: string) => {
    matched = true;
    effects.push({ type, name, category: type.match(/(delay|reverb|flanger|phaser|distortion|highPass|lowPass|pitchShift|timeStretch|loudnessNorm)/) ? 'audio' : 'video', enabled: true, value, params });
    labels.push(label || name);
  };

  // --- Color looks ---
  if (/(teal|orange)/.test(q)) addGrade({ lut: 'Cinematic Teal & Orange', temperature: 12, contrast: 14, saturation: 112 }, 'Teal & Orange grade');
  if (/(warm|sunset|golden hour|kodak)/.test(q)) addGrade({ lut: 'Warm Kodak 2383', temperature: 28, tint: 6, exposure: 0.2 }, 'Warm sunset look');
  if (/(moody|dark|bold|spooky)/.test(q)) addGrade({ contrast: 24, highlights: -18, shadows: 10, saturation: 88, vignette: 40 }, 'Moody grade');
  if (/(noir|black ?ing? ?and ?white|b ?& ?w|monochrome|desaturat)/.test(q)) addGrade({ lut: 'Film Noir Monochrome', saturation: 0, contrast: 20 }, 'Film Noir monochrome');
  if (/(vintage|retro|old film|film look)/.test(q)) addGrade({ lut: 'Vintage Film', vignette: 28, contrast: 8 }, 'Vintage film');
  if (/(neon|cyber)/.test(q)) addGrade({ lut: 'Cyberpunk Neon', contrast: 15 }, 'Cyberpunk neon');
  if (/(vignette)/.test(q)) addGrade({ vignette: 32 }, 'Vignette');
  if (/(dreamy|soft|romantic)/.test(q)) addEffect('blur', 'Dreamy Soft Focus', 8, undefined, 'Soft focus');
  if (/(glow|bloom)/.test(q)) addEffect('glow', 'Glow', 35);
  if (/(glitch|distort)/.test(q)) addEffect('glitch', 'Glitch', 30);

  // --- Camera motion ---
  if (/(shake|handheld|unstable|documentary)/.test(q)) addEffect('cameraShake', 'Camera Shake', 30, undefined, 'Subtle camera shake');
  if (/(slow zoom|zoom in|push in|ken burns|z\.?oom)/.test(q)) {
    // value = % total zoom over the clip
    addEffect('slowZoom', 'Slow Zoom In', 15, undefined, 'Slow zoom in');
  }

  // --- Speed ---
  if (/(\bslow ?(-| )?motion\b|\bslow-?mo\b|\bslower\b)/.test(q) && !/zoom/.test(RegExp.lastMatch)) {
    speed = 0.5;
    labels.push('Slow motion (0.5×)');
    matched = true;
  } else if (/(fast ?(-| )?(motion|forward|pace)|speed ?up|time ?-?lapse)/.test(q)) {
    speed = 1.5;
    labels.push('Fast playback (1.5×)');
    matched = true;
  }
  if (/\bsuper ?\s?slow\b/.test(q)) speed = 0.25;

  // --- Generic cinematic as base ---
  if (/(cinematic|filmic|movie)/.test(q)) {
    labels.unshift('Cinematic base grade');
  }

  if (!matched) {
    // Sensible fallback: light cinematic polish
    labels.push('Cinematic base grade (default)');
    effects.push({ type: 'slowZoom', name: 'Slow Zoom In', category: 'video', enabled: true, value: 12 });
  }

  return { labels, grade, effects, speed };
}

/** Curated one-click looks, executed through the very same prompt engine. */
export const CINEMATIC_LOOKS: { name: string; emoji: string; prompt: string }[] = [
  { name: 'Teal & Orange', emoji: '🎬', prompt: 'Cinematic, teal and orange color grade' },
  { name: 'Moody', emoji: '🌙', prompt: 'Moody dark look with strong vignette' },
  { name: 'Warm Sunset', emoji: '🌅', prompt: 'Warm sunset golden hour grade' },
  { name: 'Film Noir', emoji: '🕵️', prompt: 'Black and white film noir monochrome' },
  { name: 'Vintage', emoji: '📼', prompt: 'Vintage old film look with vignette' },
  { name: 'Hyperdrift', emoji: '⚡', prompt: 'Cyberpunk neon slow zoom and glow' },
];

export const MAGIC_SUGGESTIONS: string[] = [
  'Make this clip cinematic with a teal and orange grade and slow zoom',
  'Moody look with subtle camera shake',
  'Warm sunset glow, dreamy soft focus',
  'Vintage film camera shake, 0.5x slow motion',
];
