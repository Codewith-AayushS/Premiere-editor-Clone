import type { TimelineClip } from '../types/editor';

/**
 * Caption clips are regular text clips with a marker in textProperties. The id
 * prefix keeps captions created before the marker was introduced recognizable.
 */
export function isCaptionClip(clip: TimelineClip): boolean {
  return !!clip.textProperties && (clip.textProperties.isCaption === true || clip.id.startsWith('cap_'));
}
