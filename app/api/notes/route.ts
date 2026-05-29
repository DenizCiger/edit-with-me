import { NextResponse } from "next/server";
import { createNote, maybeCleanupExpiredNotes } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { generateId } from "@/lib/id";
import { MAX_NOTE_SIZE, MAX_PASSWORD_CHARS } from "@/lib/constants";
import {
  FixedWindowRateLimiter,
  getClientIp,
  normalizePassword,
  parseJsonBodyWithLimit,
} from "@/lib/security";

const createNoteLimiter = new FixedWindowRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000,
});

export async function POST(request: Request) {
  maybeCleanupExpiredNotes();

  const ip = getClientIp(request);
  const limit = createNoteLimiter.consume(`create:${ip}`);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString() },
      },
    );
  }

  let body: unknown;
  try {
    body = await parseJsonBodyWithLimit(request, MAX_NOTE_SIZE);
  } catch {
    return NextResponse.json({ error: "Invalid or oversized request body" }, { status: 400 });
  }

  let password: string | null;
  try {
    password = normalizePassword(
      body && typeof body === "object" ? (body as { password?: unknown }).password : undefined,
      MAX_PASSWORD_CHARS,
    );
  } catch {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  const id = generateId();
  const passwordHash = password ? await hashPassword(password) : null;

  createNote(id, passwordHash);

  return NextResponse.json({ id }, { status: 201 });
}
