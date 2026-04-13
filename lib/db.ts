import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import {
  CLEANUP_THROTTLE_MS,
  getStaleNoteCutoffUnixTimestamp,
} from "./retention";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "ewm.db"));
let lastCleanupAt = 0;

db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    content    BLOB,
    password   TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

export interface NoteRow {
  id: string;
  content: Buffer | null;
  password: string | null;
  created_at: number;
  updated_at: number;
}

const getNoteStmt = db.prepare(
  "SELECT * FROM notes WHERE id = ? AND updated_at >= ?"
);
const getContentStmt = db.prepare(
  "SELECT content FROM notes WHERE id = ? AND updated_at >= ?"
);
const deleteExpiredNotesStmt = db.prepare(
  "DELETE FROM notes WHERE updated_at < ?"
);

export function maybeCleanupExpiredNotes(nowMs = Date.now()): void {
  if (nowMs - lastCleanupAt < CLEANUP_THROTTLE_MS) return;
  lastCleanupAt = nowMs;
  deleteExpiredNotesStmt.run(getStaleNoteCutoffUnixTimestamp(nowMs));
}

export function createNote(id: string, passwordHash: string | null): void {
  db.prepare("INSERT INTO notes (id, password) VALUES (?, ?)").run(id, passwordHash);
}

export function getNote(id: string): NoteRow | null {
  maybeCleanupExpiredNotes();
  return getNoteStmt.get(id, getStaleNoteCutoffUnixTimestamp()) as NoteRow | null;
}

export function deleteNote(id: string): void {
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}

export function saveContent(id: string, content: Buffer): void {
  db.prepare("UPDATE notes SET content = ?, updated_at = unixepoch() WHERE id = ?").run(
    content,
    id,
  );
}

export function getContent(id: string): Buffer | null {
  maybeCleanupExpiredNotes();
  const row = getContentStmt.get(id, getStaleNoteCutoffUnixTimestamp()) as
    | { content: Buffer | null }
    | null;
  return row?.content ?? null;
}

export default db;
