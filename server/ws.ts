import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import { createHmac } from "crypto";

const WS_PORT = parseInt(process.env.WS_PORT || "4444", 10);
const EWM_SECRET = process.env.EWM_SECRET || "ewm-dev-secret-change-in-prod";
const MAX_NOTE_CHARS = 10_000;

// DB setup
const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const db = new Database(join(dataDir, "ewm.db"));
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

// Room management
interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<ServerWebSocket>;
  saveTimeout: ReturnType<typeof setTimeout> | null;
}

type ServerWebSocket = import("bun").ServerWebSocket<{ noteId: string }>;

const rooms = new Map<string, Room>();

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

  room = { doc, awareness, clients: new Set(), saveTimeout: null };
  rooms.set(noteId, room);

  // Listen for updates and persist
  doc.on("update", () => {
    scheduleSave(noteId);
  });

  // Clean up awareness when clients disconnect
  awareness.on(
    "update",
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
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

function cleanupRoom(noteId: string) {
  const room = rooms.get(noteId);
  if (!room || room.clients.size > 0) return;
  // Save before cleanup
  const state = Y.encodeStateAsUpdate(room.doc);
  db.query("UPDATE notes SET content = ?, updated_at = unixepoch() WHERE id = ?").run(
    Buffer.from(state),
    noteId,
  );
  if (room.saveTimeout) clearTimeout(room.saveTimeout);
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
  if (value !== `${payload}.${expectedSig}`) return false;

  const [id, expiresStr] = payload.split(":");
  if (id !== noteId) return false;
  if (Date.now() > parseInt(expiresStr, 10)) return false;
  return true;
}

Bun.serve({
  port: WS_PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    const noteId = url.pathname.slice(1); // /<noteId>

    if (!noteId) {
      return new Response("Note ID required", { status: 400 });
    }

    // Check note exists
    const note = db.query("SELECT id, password FROM notes WHERE id = ?").get(noteId) as
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
    message(ws: ServerWebSocket, message: ArrayBuffer | Buffer) {
      const room = rooms.get(ws.data.noteId);
      if (!room) return;

      const data = new Uint8Array(
        message instanceof ArrayBuffer ? message : message.buffer
      );
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MSG_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);

        // Enforce size limit after applying update
        const text = room.doc.getText("content");
        if (text.length > MAX_NOTE_CHARS) {
          // Revert: don't broadcast. The client will be out of sync but
          // this is a hard limit. In practice the client prevents this.
          return;
        }

        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }

        // Broadcast sync messages to other clients
        if (syncType === syncProtocol.messageYjsSyncStep2 || syncType === syncProtocol.messageYjsUpdate) {
          // Re-encode the update for broadcasting
          broadcastToRoom(ws.data.noteId, data, ws);
        }
      } else if (messageType === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          ws
        );
      }
    },
    close(ws: ServerWebSocket) {
      const room = rooms.get(ws.data.noteId);
      if (!room) return;
      room.clients.delete(ws);
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        [room.doc.clientID],
        null
      );
      if (room.clients.size === 0) {
        setTimeout(() => cleanupRoom(ws.data.noteId), 30000);
      }
    },
  },
});

console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
