import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import { createHmac, timingSafeEqual } from "crypto";
import { EWM_SECRET, MAX_NOTE_CHARS, WS_PORT } from "../lib/constants";
import {
  isAllowedOrigin,
  isBinaryMessageWithinLimit,
  tryApplyValidatedYjsUpdate,
} from "./ws-helpers";
import {
  CLEANUP_THROTTLE_MS,
  getStaleNoteCutoffUnixTimestamp,
} from "../lib/retention";

// DB setup
const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const db = new Database(join(dataDir, "ewm.db"));
let lastCleanupAt = 0;
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA busy_timeout = 5000");
db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content BLOB,
    password TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

// Message types
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MAX_WS_MESSAGE_BYTES = 64 * 1024;
const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Room management
interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<ServerWebSocket>;
  clientAwarenessIds: Map<ServerWebSocket, Set<number>>;
  saveTimeout: ReturnType<typeof setTimeout> | null;
}

type ServerWebSocket = import("bun").ServerWebSocket<{ noteId: string }>;

const rooms = new Map<string, Room>();

function cleanupExpiredNotes(nowMs = Date.now()) {
  const staleNoteIds = db.query("SELECT id FROM notes WHERE updated_at < ?").all(
    getStaleNoteCutoffUnixTimestamp(nowMs)
  ) as { id: string }[];

  for (const { id } of staleNoteIds) {
    const room = rooms.get(id);
    if (room && room.clients.size > 0) continue;
    db.query("DELETE FROM notes WHERE id = ?").run(id);
  }
}

function maybeCleanupExpiredNotes(nowMs = Date.now()) {
  if (nowMs - lastCleanupAt < CLEANUP_THROTTLE_MS) return;
  lastCleanupAt = nowMs;
  cleanupExpiredNotes(nowMs);
}

function getOrCreateRoom(noteId: string): Room {
  let room = rooms.get(noteId);
  if (room) return room;

  const doc = new Y.Doc();

  // Load persisted content
  const row = db.query("SELECT content FROM notes WHERE id = ?").get(noteId) as
    | { content: Buffer | null }
    | null;
  if (row?.content) {
    Y.applyUpdate(doc, new Uint8Array(row.content));
  }

  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null); // server has no local state

  room = {
    doc,
    awareness,
    clients: new Set(),
    clientAwarenessIds: new Map(),
    saveTimeout: null,
  };
  rooms.set(noteId, room);

  // Listen for updates and persist
  doc.on("update", () => {
    scheduleSave(noteId);
  });

  // Clean up awareness when clients disconnect
  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: ServerWebSocket | null,
    ) => {
      if (origin) {
        const tracked = room.clientAwarenessIds.get(origin) ?? new Set<number>();
        for (const id of [...added, ...updated]) tracked.add(id);
        for (const id of removed) tracked.delete(id);
        room.clientAwarenessIds.set(origin, tracked);
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [
          ...added,
          ...updated,
          ...removed,
        ])
      );
      const msg = encoding.toUint8Array(encoder);
      broadcastToRoom(noteId, msg, null);
    }
  );

  return room;
}

function scheduleSave(noteId: string) {
  const room = rooms.get(noteId);
  if (!room) return;
  if (room.saveTimeout) clearTimeout(room.saveTimeout);
  room.saveTimeout = setTimeout(() => {
    const state = Y.encodeStateAsUpdate(room.doc);
    db.query("UPDATE notes SET content = ?, updated_at = unixepoch() WHERE id = ?").run(
      Buffer.from(state),
      noteId,
    );
  }, 1000);
}

function broadcastToRoom(
  noteId: string,
  msg: Uint8Array,
  exclude: ServerWebSocket | null
) {
  const room = rooms.get(noteId);
  if (!room) return;
  for (const client of room.clients) {
    if (client !== exclude) {
      client.send(msg);
    }
  }
}

function flushRoom(noteId: string): void {
  const room = rooms.get(noteId);
  if (!room) return;
  const state = Y.encodeStateAsUpdate(room.doc);
  db.query("UPDATE notes SET content = ?, updated_at = unixepoch() WHERE id = ?").run(
    Buffer.from(state),
    noteId,
  );
  if (room.saveTimeout) {
    clearTimeout(room.saveTimeout);
    room.saveTimeout = null;
  }
}

function flushAllRooms(): void {
  for (const noteId of rooms.keys()) flushRoom(noteId);
}

function cleanupRoom(noteId: string) {
  const room = rooms.get(noteId);
  if (!room || room.clients.size > 0) return;
  flushRoom(noteId);
  room.doc.destroy();
  rooms.delete(noteId);
}

// Cookie verification
function verifyAuthCookie(noteId: string, cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const cookieName = `ewm_${noteId}`;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`));
  if (!match) return false;
  const value = match.split("=").slice(1).join("=");

  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = value.slice(0, lastDot);
  const expectedSig = createHmac("sha256", EWM_SECRET)
    .update(payload)
    .digest("base64url");
  const expectedValue = `${payload}.${expectedSig}`;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expectedValue);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  const [id, expiresStr] = payload.split(":");
  if (id !== noteId) return false;
  if (Date.now() > parseInt(expiresStr, 10)) return false;
  return true;
}

process.on("SIGTERM", () => {
  flushAllRooms();
  process.exit(0);
});

process.on("SIGINT", () => {
  flushAllRooms();
  process.exit(0);
});

Bun.serve<{ noteId: string }>({
  port: WS_PORT,
  fetch(req, server) {
    maybeCleanupExpiredNotes();

    if (!isAllowedOrigin(req.headers.get("origin"), req.headers.get("host"))) {
      return new Response("Forbidden origin", { status: 403 });
    }

    const url = new URL(req.url);
    const noteId = url.pathname.slice(1); // /<noteId>

    if (!noteId || !NOTE_ID_PATTERN.test(noteId)) {
      return new Response("Valid note ID required", { status: 400 });
    }

    // Check note exists
    const note = db
      .query("SELECT id, password FROM notes WHERE id = ? AND updated_at >= ?")
      .get(noteId, getStaleNoteCutoffUnixTimestamp()) as
      | { id: string; password: string | null }
      | null;
    if (!note) {
      return new Response("Note not found", { status: 404 });
    }

    // Check auth for password-protected notes
    if (note.password) {
      const cookieHeader = req.headers.get("cookie");
      if (!verifyAuthCookie(noteId, cookieHeader)) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const upgraded = server.upgrade(req, { data: { noteId } });
    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
  },
  websocket: {
    open(ws: ServerWebSocket) {
      const room = getOrCreateRoom(ws.data.noteId);
      room.clients.add(ws);

      // Send sync step 1
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(encoder, room.doc);
      ws.send(encoding.toUint8Array(encoder));

      // Send current awareness
      const awarenessStates = room.awareness.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(
            room.awareness,
            Array.from(awarenessStates.keys())
          )
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
      }
    },
    message(ws: ServerWebSocket, message: string | ArrayBuffer | Buffer) {
      const room = rooms.get(ws.data.noteId);
      if (!room) return;
      if (typeof message === "string") return;

      const data = message instanceof ArrayBuffer
        ? new Uint8Array(message)
        : new Uint8Array(message.buffer, message.byteOffset, message.byteLength);

      if (!isBinaryMessageWithinLimit(data, MAX_WS_MESSAGE_BYTES)) {
        ws.close(1009, "Message too large");
        return;
      }

      try {
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === MSG_SYNC) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_SYNC);
          const syncMessageType = decoding.readVarUint(decoder);

          if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
            syncProtocol.readSyncStep1(decoder, encoder, room.doc);
            ws.send(encoding.toUint8Array(encoder));
            return;
          }

          if (
            syncMessageType === syncProtocol.messageYjsSyncStep2 ||
            syncMessageType === syncProtocol.messageYjsUpdate
          ) {
            const update = decoding.readVarUint8Array(decoder);
            const result = tryApplyValidatedYjsUpdate(
              room.doc,
              update,
              MAX_NOTE_CHARS,
              MAX_WS_MESSAGE_BYTES,
            );
            if (!result.ok) {
              ws.close(result.reason === "too_large" ? 1009 : 1003, result.reason ?? "Invalid update");
              return;
            }
            broadcastToRoom(ws.data.noteId, data, ws);
            return;
          }

          ws.close(1003, "Unknown sync message");
          return;
        }

        if (messageType === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            ws,
          );
          return;
        }

        ws.close(1003, "Unknown message type");
      } catch {
        ws.close(1003, "Invalid message");
      }
    },
    close(ws: ServerWebSocket) {
      const room = rooms.get(ws.data.noteId);
      if (!room) return;
      room.clients.delete(ws);
      const trackedAwarenessIds = room.clientAwarenessIds.get(ws);
      if (trackedAwarenessIds?.size) {
        awarenessProtocol.removeAwarenessStates(
          room.awareness,
          [...trackedAwarenessIds],
          null,
        );
      }
      room.clientAwarenessIds.delete(ws);
      if (room.clients.size === 0) {
        setTimeout(() => cleanupRoom(ws.data.noteId), 30000);
      }
    },
  },
});

console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
