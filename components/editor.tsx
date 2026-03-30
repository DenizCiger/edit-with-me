"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

const colors = [
  "#30bced",
  "#6eeb83",
  "#ffbc42",
  "#ecd444",
  "#ee6352",
  "#9ac2c9",
  "#8acb88",
  "#ff8552",
  "#c6c013",
  "#e8a628",
];

function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

const MAX_CHARS = 10_000;

interface EditorProps {
  noteId: string;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected", users: number) => void;
}

export default function Editor({ noteId, onStatusChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">(
    "connecting"
  );
  const statusRef = useRef(status);
  const [users, setUsers] = useState(1);
  const [charCount, setCharCount] = useState(0);

  const setupEditor = useCallback(() => {
    if (!containerRef.current) return;

    const ydoc = new Y.Doc();
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4444";

    const provider = new WebsocketProvider(wsUrl, noteId, ydoc);
    const ytext = ydoc.getText("content");

    const userColor = getRandomColor();
    const userName = `User ${Math.floor(Math.random() * 1000)}`;

    provider.awareness.setLocalStateField("user", {
      name: userName,
      color: userColor,
      colorLight: userColor + "33",
    });

    provider.on("status", ({ status: s }: { status: string }) => {
      const st = s as "connecting" | "connected" | "disconnected";
      statusRef.current = st;
      setStatus(st);
      onStatusChange?.(st, provider.awareness.getStates().size);
    });

    provider.awareness.on("change", () => {
      const count = provider.awareness.getStates().size;
      setUsers(count);
      onStatusChange?.(statusRef.current, count);
    });

    // Size limit extension
    const sizeLimit = EditorState.transactionFilter.of((tr) => {
      if (!tr.docChanged) return tr;
      const newLength = tr.newDoc.length;
      if (newLength > MAX_CHARS) return [];
      return tr;
    });

    const theme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px",
      },
      ".cm-content": {
        fontFamily: "var(--font-geist-mono), monospace",
        padding: "16px",
        caretColor: "var(--foreground, #000)",
      },
      ".cm-editor": {
        height: "100%",
      },
      ".cm-scroller": {
        overflow: "auto",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid var(--border, #e5e5e5)",
        color: "var(--muted-foreground, #999)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-activeLine": {
        backgroundColor: "var(--accent, #f5f5f5)",
      },
      ".cm-selectionBackground": {
        backgroundColor: "var(--accent, #e5e5e5) !important",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--foreground, #000)",
      },
      ".cm-ySelectionCaret": {
        position: "relative",
        display: "inline",
        borderLeft: "1px solid black",
        borderRight: "1px solid black",
        marginLeft: "-1px",
        marginRight: "-1px",
        boxSizing: "border-box",
      },
      ".cm-ySelectionCaretDot": {
        display: "inline-block",
        position: "absolute",
        width: ".4em",
        height: ".4em",
        top: "-.2em",
        left: "-.2em",
        borderRadius: "50%",
      },
      ".cm-ySelectionInfo": {
        display: "inline-block",
        position: "absolute",
        top: "-1.15em",
        left: "-1px",
        fontSize: "0.75em",
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontWeight: "600",
        padding: "0 4px",
        borderRadius: "4px 4px 4px 0",
        lineHeight: "normal",
        userSelect: "none",
        whiteSpace: "nowrap",
        opacity: "0",
        transitionDelay: "0s",
        zIndex: "10",
      },
      ".cm-ySelectionCaret:hover > .cm-ySelectionInfo": {
        opacity: "1",
      },
    });

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        lineNumbers(),
        placeholder("Start typing..."),
        theme,
        EditorView.lineWrapping,
        yCollab(ytext, provider.awareness),
        sizeLimit,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setCharCount(update.state.doc.length);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    setCharCount(ytext.length);

    return () => {
      provider.destroy();
      ydoc.destroy();
      view.destroy();
    };
  }, [noteId]);

  useEffect(() => {
    const cleanup = setupEditor();
    return cleanup;
  }, [setupEditor]);

  return (
    <div className="relative flex flex-col h-full">
      <div ref={containerRef} className="flex-1 overflow-hidden" />
      <div
        className={`absolute bottom-3 right-3 text-xs px-2.5 py-1 rounded-full bg-background/80 backdrop-blur border text-muted-foreground select-none ${
          charCount > MAX_CHARS * 0.9 ? "text-destructive border-destructive/30" : ""
        }`}
      >
        {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
      </div>
    </div>
  );
}
