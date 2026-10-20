/**
 * Premiere Pro SMPTE Timecode utilities
 */

export function formatTimecode(seconds: number, fps: number = 30): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  
  const totalFrames = Math.floor(seconds * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(seconds);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');

  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

export function parseTimecode(tc: string, fps: number = 30): number {
  const parts = tc.split(/[:;]/).map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return 0;
  }
  const [h, m, s, f] = parts;
  return h * 3600 + m * 60 + s + f / fps;
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}`;
}

// Snapping helper: checks whether targetTime is within threshold distance of any snap point
export function snapToGrid(
  targetTime: number,
  snapPoints: number[],
  thresholdSeconds: number = 0.2
): { time: number; snapped: boolean } {
  let closestDist = thresholdSeconds;
  let snappedTime = targetTime;
  let snapped = false;

  for (const pt of snapPoints) {
    const dist = Math.abs(targetTime - pt);
    if (dist < closestDist) {
      closestDist = dist;
      snappedTime = pt;
      snapped = true;
    }
  }

  return { time: snappedTime, snapped };
}

