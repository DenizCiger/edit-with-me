export const MAX_NOTE_SIZE = 10 * 1024; // 10KB in bytes
export const MAX_NOTE_CHARS = 10_000; // ~10KB for plain text
export const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
export const WS_PORT = parseInt(process.env.WS_PORT || "4444", 10);
export const EWM_SECRET = process.env.EWM_SECRET || "ewm-dev-secret-change-in-prod";
