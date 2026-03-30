import { NextResponse } from "next/server";
import { getNote, deleteNote } from "@/lib/db";
import { verifyAuthCookie } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const note = getNote(id);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: note.id,
    hasPassword: !!note.password,
    createdAt: note.created_at,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const note = getNote(id);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (note.password) {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(`ewm_${id}`);
    if (!verifyAuthCookie(id, cookie?.value)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  deleteNote(id);
  return NextResponse.json({ ok: true });
}
