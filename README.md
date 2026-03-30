# Edit With Me

Real-time collaborative text editor. Create a note, share the URL, and edit together live. Notes are limited to 10,000 characters and can be optionally password protected.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Yjs** — CRDT-based conflict-free collaboration
- **CodeMirror 6** — editor with multi-cursor awareness
- **Bun** — runtime & package manager
- **SQLite** (better-sqlite3) — persistence
- **Argon2** — password hashing
- **shadcn/ui** + Tailwind CSS 4

## Getting Started

```bash
# Install dependencies
bun install

# Copy env file and set a secret
cp .env.example .env.local

# Run both the Next.js app and WebSocket server
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EWM_SECRET` | — | **Required in production.** Secret for signing auth cookies. |
| `WS_PORT` | `4444` | Port for the WebSocket server. |
| `NEXT_PUBLIC_WS_PORT` | `4444` | WS port exposed to the browser. |

## Architecture

Two processes run concurrently:

1. **Next.js** — serves the UI and REST API (`/api/notes`)
2. **Bun WebSocket server** (`server/ws.ts`) — handles real-time Yjs sync on port 4444

Notes are persisted to a local SQLite database (`data/ewm.db`, gitignored). The Yjs document state is stored as a binary blob and loaded on first connection.

## Security

- Passwords are hashed with Argon2
- Auth cookies are HMAC-signed (`sha256`), `httpOnly`, `sameSite: strict`, `secure` in production
- 10KB size limit enforced on both client and server
- Rate limiting on note creation (20 notes/IP/hour, in-memory)
- WebSocket connections to password-protected notes require a valid auth cookie

## Deployment

The WebSocket server requires a persistent process — it won't work on serverless platforms (Vercel, Netlify). Deploy to a VPS or any platform that supports long-running Node/Bun processes (Railway, Fly.io, Render, etc.).

```bash
bun run build
bun start
```

Make sure `EWM_SECRET` is set to a strong random value in production.
