import { describe, expect, test } from "bun:test";
import { sanitizeMarkdown } from "../../lib/markdown";
import { getEwmSecret } from "../../lib/config";
import {
  FixedWindowRateLimiter,
  getClientIp,
  parseJsonBodyWithLimit,
} from "../../lib/security";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("https://ewm.test/api", { headers });
}

describe("markdown sanitization", () => {
  test("fails closed without a browser DOM", () => {
    expect(() => sanitizeMarkdown(
      "# Hi\n<img src=x onerror=alert(1)>\n<a href=\"javascript:alert(1)\">bad</a>",
    )).toThrow(/browser DOM/);
  });
});

describe("production secret configuration", () => {
  test("throws in production when EWM_SECRET is missing", () => {
    expect(() => getEwmSecret({ NODE_ENV: "production" })).toThrow(
      /EWM_SECRET is required/,
    );
  });

  test("allows development fallback outside production", () => {
    expect(getEwmSecret({ NODE_ENV: "development" })).toBe(
      "ewm-dev-secret-change-in-prod",
    );
  });
});

describe("request security helpers", () => {
  test("uses trusted real-ip header before spoofable forwarded-for", () => {
    const request = requestWithHeaders({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.99, 203.0.113.10",
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  test("rejects JSON request bodies over byte limit", async () => {
    const request = new Request("https://ewm.test/api", {
      method: "POST",
      body: JSON.stringify({ password: "x".repeat(20) }),
      headers: { "content-type": "application/json" },
    });

    await expect(parseJsonBodyWithLimit(request, 16)).rejects.toThrow(/too large/);
  });

  test("fixed-window limiter rejects attempts over the configured limit", () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 2,
      windowMs: 60_000,
      maxKeys: 10,
    });

    expect(limiter.consume("ip:note", 0).allowed).toBe(true);
    expect(limiter.consume("ip:note", 1).allowed).toBe(true);
    expect(limiter.consume("ip:note", 2).allowed).toBe(false);
    expect(limiter.consume("ip:note", 60_001).allowed).toBe(true);
  });
});
