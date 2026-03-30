import { NextResponse } from "next/server";
import { getNote } from "@/lib/db";
import { verifyPassword, createAuthCookie } from "@/lib/auth";
import { cookies } from "next/headers";

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

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  const valid = await verifyPassword(note.password, password);
  if (!valid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const { name, value, options } = createAuthCookie(id);
  const cookieStore = await cookies();
  cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);

  return NextResponse.json({ ok: true });
}
