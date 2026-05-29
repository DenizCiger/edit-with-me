import * as Y from "yjs";

export interface ValidatedUpdateResult {
  ok: boolean;
  reason?: "invalid_update" | "too_large";
}

function normalizeHost(value: string): string {
  return value.split(":")[0]?.toLowerCase() ?? value.toLowerCase();
}

export function isAllowedOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return true;

  try {
    return normalizeHost(new URL(origin).host) === normalizeHost(host);
  } catch {
    return false;
  }
}

export function isBinaryMessageWithinLimit(message: ArrayBuffer | Uint8Array, maxBytes: number): boolean {
  return message.byteLength <= maxBytes;
}

export function tryApplyValidatedYjsUpdate(
  liveDoc: Y.Doc,
  update: Uint8Array,
  maxTextLength: number,
  maxEncodedStateBytes: number,
): ValidatedUpdateResult {
  const candidate = new Y.Doc();

  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(liveDoc));
    Y.applyUpdate(candidate, update);
  } catch {
    candidate.destroy();
    return { ok: false, reason: "invalid_update" };
  }

  const candidateText = candidate.getText("content");
  const candidateStateBytes = Y.encodeStateAsUpdate(candidate).byteLength;
  if (candidateText.length > maxTextLength || candidateStateBytes > maxEncodedStateBytes) {
    candidate.destroy();
    return { ok: false, reason: "too_large" };
  }

  candidate.destroy();
  Y.applyUpdate(liveDoc, update);
  return { ok: true };
}
