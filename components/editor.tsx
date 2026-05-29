"use client";

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { sanitizeMarkdown } from "@/lib/markdown";
import { Eye, EyeOff } from "lucide-react";

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
  onTitleChange?: (title: string) => void;
}

export interface EditorHandle {
  setTitle: (title: string) => void;
}

function EditorInner({ noteId, onStatusChange, onTitleChange }: EditorProps, ref: React.Ref<EditorHandle>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const onTitleChangeRef = useRef(onTitleChange);
  const statusRef = useRef<"connecting" | "connected" | "disconnected">("connecting");
  const [charCount, setCharCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onTitleChangeRef.current = onTitleChange;
  }, [onStatusChange, onTitleChange]);

  const updatePreview = useCallback((text: string) => {
    setPreviewHtml(sanitizeMarkdown(text));
  }, []);

  const setupEditor = useCallback(() => {
    if (!containerRef.current) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4444";

    const provider = new WebsocketProvider(wsUrl, noteId, ydoc);
    providerRef.current = provider;
    const ytext = ydoc.getText("content");
    const yMeta = ydoc.getMap("meta");

    // Observe title changes
    yMeta.observe(() => {
      const title = yMeta.get("title") as string | undefined;
      onTitleChangeRef.current?.(title || "");
    });

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
      onStatusChangeRef.current?.(st, provider.awareness.getStates().size);
    });

    provider.awareness.on("change", () => {
      const count = provider.awareness.getStates().size;
      onStatusChangeRef.current?.(statusRef.current, count);
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
        markdown({ codeLanguages: languages }),
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

    // Update preview when text changes
    ytext.observe(() => {
      updatePreview(ytext.toString());
    });
    updatePreview(ytext.toString());

    // Emit initial title
    const initialTitle = yMeta.get("title") as string | undefined;
    if (initialTitle) onTitleChangeRef.current?.(initialTitle);

    return () => {
      provider.destroy();
      ydoc.destroy();
      view.destroy();
    };
  }, [noteId, updatePreview]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const setupId = window.setTimeout(() => {
      cleanup = setupEditor();
    }, 0);

    return () => {
      window.clearTimeout(setupId);
      cleanup?.();
    };
  }, [setupEditor]);

  useImperativeHandle(ref, () => ({
    setTitle: (title: string) => {
      const yMeta = ydocRef.current?.getMap("meta");
      if (yMeta) yMeta.set("title", title);
    },
  }));

  return (
    <div className="relative flex h-full">
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden ${showPreview ? "w-1/2" : "w-full"}`}
      />
      {showPreview && (
        <div className="w-1/2 border-l overflow-auto p-6 prose prose-sm dark:prose-invert max-w-none">
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs px-2.5 py-1 rounded-full bg-background/80 backdrop-blur border text-muted-foreground hover:text-foreground transition-colors"
          title={showPreview ? "Hide preview" : "Show preview"}
        >
          {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <div
          className={`text-xs px-2.5 py-1 rounded-full bg-background/80 backdrop-blur border text-muted-foreground select-none ${
            charCount > MAX_CHARS * 0.9 ? "text-destructive border-destructive/30" : ""
          }`}
        >
          {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

const Editor = forwardRef(EditorInner);
export default Editor;
