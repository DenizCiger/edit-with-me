import { NextResponse } from "next/server";
import { createNote } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { generateId } from "@/lib/id";

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW);
  rateLimitMap.set(ip, recent);
  return recent.length >= RATE_LIMIT;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" && body.password.length > 0
    ? body.password
    : null;

  const id = generateId();
  const passwordHash = password ? await hashPassword(password) : null;

  createNote(id, passwordHash);

  // Record for rate limiting
  const timestamps = rateLimitMap.get(ip) ?? [];
  timestamps.push(Date.now());
  rateLimitMap.set(ip, timestamps);

  return NextResponse.json({ id }, { status: 201 });
}
