import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "ewm.db"));

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

export function createNote(id: string, passwordHash: string | null): void {
  db.prepare("INSERT INTO notes (id, password) VALUES (?, ?)").run(id, passwordHash);
}

export function getNote(id: string): NoteRow | null {
  return db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | null;
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
  const row = db
    .prepare("SELECT content FROM notes WHERE id = ?")
    .get(id) as { content: Buffer | null } | null;
  return row?.content ?? null;
}

export default db;
