"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { Lock, PenLine } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
  }, []);

  async function createNote() {
    if (loading) return;
    setLoading(true);
    try {
      const body: Record<string, string> = {};
      if (showPassword && password) {
        body.password = password;
      }

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create note");
        return;
      }

      const { id } = await res.json();
      router.push(`/${id}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!(showPassword && !password)) {
          createNote();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <PenLine className="h-4 w-4" />
          <span>ewm</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 dot-grid-bg">
        <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Edit With Me</h1>
            <p className="text-sm text-muted-foreground">
              Create a note and collaborate in real-time.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Lock className="h-3.5 w-3.5" />
              {showPassword ? "Remove password" : "Add password protection"}
            </button>

            {showPassword && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <Input
                  type="password"
                  placeholder="Enter a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <Button
              onClick={createNote}
              className="w-full"
              disabled={loading || (showPassword && !password)}
            >
              {loading ? "Creating..." : "Create note"}
            </Button>

            <p className="text-center">
              <kbd className="text-[10px] text-muted-foreground/60 font-mono px-1.5 py-0.5 rounded border bg-muted">
                {isMac ? "⌘" : "Ctrl"} + Enter
              </kbd>
            </p>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Notes are limited to 10,000 characters. Share the URL to
            collaborate.
          </p>
        </div>
      </main>
    </div>
  );
}
