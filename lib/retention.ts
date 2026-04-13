export const STALE_NOTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CLEANUP_THROTTLE_MS = 5 * 60 * 1000;

export function getStaleNoteCutoffUnixTimestamp(nowMs = Date.now()): number {
  return Math.floor((nowMs - STALE_NOTE_MAX_AGE_MS) / 1000);
}

export function isNoteExpired(updatedAt: number, nowMs = Date.now()): boolean {
  return updatedAt < getStaleNoteCutoffUnixTimestamp(nowMs);
}
