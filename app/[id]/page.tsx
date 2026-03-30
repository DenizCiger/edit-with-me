"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PasswordModal from "@/components/password-modal";
import { Button } from "@/components/ui/button";
import { Check, Copy, Trash2 } from "lucide-react";
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
          // Try existing cookie first
          fetch(`/api/notes/${noteId}/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "" }),
          }).then((res) => {
            // If note has no password or cookie is valid, we get ok
            // But this note HAS a password, so empty password won't work unless cookie is set
            // Actually let's just check if auth cookie exists by trying the WS connection
            setState({ status: "needs_password" });
          });
        } else {
          setState({ status: "ready" });
        }
      })
      .catch(() => setState({ status: "not_found" }));
  }, [noteId]);

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
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Note not found</p>
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
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <button
          onClick={() => router.push("/")}
          className="text-sm font-medium hover:text-muted-foreground transition-colors"
        >
          ewm
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-1.5 text-xs">Share</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Editor noteId={noteId} />
      </main>
    </div>
  );
}
