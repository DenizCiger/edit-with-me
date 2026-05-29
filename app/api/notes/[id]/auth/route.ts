import { NextResponse } from "next/server";
import { getNote } from "@/lib/db";
import { verifyPassword, createAuthCookie, verifyAuthCookie } from "@/lib/auth";
import { cookies } from "next/headers";
import { MAX_NOTE_SIZE, MAX_PASSWORD_CHARS } from "@/lib/constants";
import {
  FixedWindowRateLimiter,
  getClientIp,
  normalizePassword,
  parseJsonBodyWithLimit,
} from "@/lib/security";

const authLimiter = new FixedWindowRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000,
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const note = getNote(id);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (!note.password) {
    return NextResponse.json({ authorized: true, hasPassword: false });
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(`ewm_${id}`);

  return NextResponse.json({
    authorized: verifyAuthCookie(id, cookie?.value),
    hasPassword: true,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const note = getNote(id);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (!note.password) {
    return NextResponse.json({ ok: true });
  }

  const ip = getClientIp(request);
  const limit = authLimiter.consume(`auth:${id}:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
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

  let password: string;
  try {
    password = normalizePassword(
      body && typeof body === "object" ? (body as { password?: unknown }).password : undefined,
      MAX_PASSWORD_CHARS,
    ) ?? "";
  } catch {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  const valid = await verifyPassword(note.password, password);
  if (!valid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const { name, value, options } = createAuthCookie(id);
  const cookieStore = await cookies();
  cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);

  return NextResponse.json({ ok: true });
}
