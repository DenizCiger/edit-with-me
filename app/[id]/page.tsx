"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { EditorHandle } from "@/components/editor";
import PasswordModal from "@/components/password-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Check, Copy, FileX, PenLine, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const Editor = dynamic(() => import("@/components/editor"), { ssr: false });

type NoteState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "needs_password" }
  | { status: "ready" };

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const noteId = params.id as string;
  const [state, setState] = useState<NoteState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [connStatus, setConnStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [userCount, setUserCount] = useState(1);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  useEffect(() => {
    fetch(`/api/notes/${noteId}`)
      .then((res) => {
        if (!res.ok) {
          setState({ status: "not_found" });
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.hasPassword) {
          fetch(`/api/notes/${noteId}/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "" }),
          }).then(() => {
            setState({ status: "needs_password" });
          });
        } else {
          setState({ status: "ready" });
        }
      })
      .catch(() => setState({ status: "not_found" }));
  }, [noteId]);

  // Update browser tab title
  useEffect(() => {
    document.title = title ? `${title} — ewm` : "ewm";
  }, [title]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
  }, []);

  function commitTitle(value: string) {
    const trimmed = value.trim();
    setEditingTitle(false);
    editorRef.current?.setTitle(trimmed);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this note permanently?")) return;
    const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
    } else {
      toast.error("Failed to delete note");
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-col h-screen animate-in fade-in duration-300">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-muted animate-pulse rounded" />
            <div className="h-8 w-8 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-3">
          <div className="h-3.5 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-3.5 w-1/2 bg-muted animate-pulse rounded" />
          <div className="h-3.5 w-5/6 bg-muted animate-pulse rounded" />
          <div className="h-3.5 w-2/3 bg-muted animate-pulse rounded" />
          <div className="h-3.5 w-1/3 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 animate-in fade-in duration-500">
        <FileX className="h-10 w-10 text-muted-foreground/50" />
        <div className="text-center space-y-1.5">
          <h2 className="text-lg font-medium">Note not found</h2>
          <p className="text-sm text-muted-foreground">
            This note may have been deleted or never existed.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/")}>
          Create a new note
        </Button>
      </div>
    );
  }

  if (state.status === "needs_password") {
    return (
      <PasswordModal
        noteId={noteId}
        onSuccess={() => setState({ status: "ready" })}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen animate-in fade-in duration-300">
      <header className="flex items-center justify-between px-4 py-2.5 border-b">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm font-semibold hover:text-muted-foreground"
          >
            <PenLine className="h-4 w-4" />
            <span>ewm</span>
          </button>
          <div className="w-px h-4 bg-border" />
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={title}
              placeholder="Untitled"
              className="text-sm font-medium bg-transparent border-b border-foreground/20 outline-none px-1 py-0.5 w-48 focus:border-foreground/50"
              onBlur={(e) => commitTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="text-sm font-medium text-foreground/80 hover:text-foreground truncate max-w-[200px]"
              title="Click to rename"
            >
              {title || "Untitled"}
            </button>
          )}
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                connStatus === "connected"
                  ? "bg-green-500"
                  : connStatus === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
              }`}
            />
            <span className="capitalize">{connStatus}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{userCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="ml-1.5 text-xs hidden sm:inline">Share</span>
          </Button>
          <ThemeToggle />
          <div className="w-px h-4 bg-border" />
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Editor
          ref={editorRef}
          noteId={noteId}
          onStatusChange={(status, users) => {
            setConnStatus(status);
            setUserCount(users);
          }}
          onTitleChange={handleTitleChange}
        />
      </main>
    </div>
  );
}
