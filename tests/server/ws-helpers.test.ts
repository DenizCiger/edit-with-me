import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  isAllowedOrigin,
  isBinaryMessageWithinLimit,
  tryApplyValidatedYjsUpdate,
} from "../../server/ws-helpers";

describe("websocket security helpers", () => {
  test("allows missing origin and same-host origins", () => {
    expect(isAllowedOrigin(null, "ewm.ciger.dev")).toBe(true);
    expect(isAllowedOrigin("https://ewm.ciger.dev", "ewm.ciger.dev")).toBe(true);
    expect(isAllowedOrigin("https://attacker.test", "ewm.ciger.dev")).toBe(false);
  });

  test("rejects oversized binary payloads before decoding", () => {
    expect(isBinaryMessageWithinLimit(new Uint8Array(4), 4)).toBe(true);
    expect(isBinaryMessageWithinLimit(new Uint8Array(5), 4)).toBe(false);
  });

  test("validates Yjs text length before mutating live document", () => {
    const liveDoc = new Y.Doc();
    liveDoc.getText("content").insert(0, "safe");

    const candidate = new Y.Doc();
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(liveDoc));
    candidate.getText("content").insert(4, "-too-long");
    const update = Y.encodeStateAsUpdate(candidate);

    const result = tryApplyValidatedYjsUpdate(liveDoc, update, 5, 64 * 1024);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(liveDoc.getText("content").toString()).toBe("safe");
  });

  test("rejects updates that make non-text shared state too large", () => {
    const live = new Y.Doc();
    live.getText("content").insert(0, "ok");

    const attacker = new Y.Doc();
    Y.applyUpdate(attacker, Y.encodeStateAsUpdate(live));
    attacker.getMap("meta").set("blob", "x".repeat(2_000));
    const update = Y.encodeStateAsUpdate(attacker);

    const result = tryApplyValidatedYjsUpdate(live, update, 10_000, 1_000);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(live.getMap("meta").get("blob")).toBeUndefined();
  });
});
