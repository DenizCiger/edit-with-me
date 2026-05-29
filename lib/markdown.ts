import DOMPurify from "dompurify";
import { marked } from "marked";

export function sanitizeMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;

  if (typeof window === "undefined" || !window.document) {
    throw new Error("sanitizeMarkdown requires a browser DOM");
  }

  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "style"],
    FORBID_ATTR: ["style"],
  });
}
