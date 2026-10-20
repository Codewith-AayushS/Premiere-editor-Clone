import type { AudioTransitionType, TimelineClip, VolumeKeyframe } from '../types/editor';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Shape a linear 0..1 fade progress according to the selected transition.
 *  These formulas match the FFmpeg afade curves used by the export
 *  (qsin / tri / exp), so preview and render sound the same. */
export function applyFadeCurve(progress: number, transition?: AudioTransitionType): number {
  const x = clamp(progress, 0, 1);
  if (transition === 'constant-power') return Math.sin((Math.PI / 2) * x); // afade qsin
  if (transition === 'exponential') return Math.pow(10, 5 * (x - 1)); // afade exp = 0.1^(5(1-x))
  return x; // constant-gain / linear (afade tri)
}

/** Interpolate the volume-automation curve at a time relative to the clip start. */
export function getVolumeAutomationAt(
  keyframes: VolumeKeyframe[] | undefined,
  localTime: number
): number {
  if (!keyframes || keyframes.length === 0) return 1;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) return sorted[0].volume;
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) return last.volume;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTime <= b.time) {
      const span = b.time - a.time;
      if (span <= 0.0001) return b.volume;
      const t = (localTime - a.time) / span;
      return a.volume + (b.volume - a.volume) * t;
    }
  }
  return last.volume;
}

/**
 * Effective clip gain at a point in time: clip volume x automation x fades.
 * Matches the filters used by the FFmpeg export.
 */
export function getClipGainAt(
  clip: Pick<TimelineClip, 'volume' | 'volumeKeyframes' | 'fadeIn' | 'fadeOut' | 'duration' | 'audioTransition'>,
  localTime: number
): number {
  const duration = Math.max(0.1, clip.duration || 0.1);
  const t = clamp(localTime, 0, duration);
  let gain = (typeof clip.volume === 'number' ? clip.volume : 1) *
    getVolumeAutomationAt(clip.volumeKeyframes, t);

  const fadeIn = Math.max(0, Math.min(duration, clip.fadeIn || 0));
  if (fadeIn > 0.005 && t < fadeIn) {
    gain *= applyFadeCurve(t / fadeIn, clip.audioTransition);
  }

  const fadeOut = Math.max(0, Math.min(duration, clip.fadeOut || 0));
  if (fadeOut > 0.005 && t > duration - fadeOut) {
    gain *= applyFadeCurve((duration - t) / fadeOut, clip.audioTransition);
  }

  return clamp(gain, 0, 4);
}
