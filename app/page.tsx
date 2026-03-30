"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function createNote() {
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
        alert(data.error || "Failed to create note");
        return;
      }

      const { id } = await res.json();
      router.push(`/${id}`);
    } catch {
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Edit With Me</h1>
          <p className="text-sm text-muted-foreground">
            Create a note and collaborate in real-time.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            {showPassword ? "Remove password" : "Add password protection"}
          </button>

          {showPassword && (
            <Input
              type="password"
              placeholder="Enter a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          )}

          <Button
            onClick={createNote}
            className="w-full"
            disabled={loading || (showPassword && !password)}
          >
            {loading ? "Creating..." : "Create note"}
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Notes are limited to 10,000 characters. Share the URL to collaborate.
        </p>
      </div>
    </div>
  );
}
