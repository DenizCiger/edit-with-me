export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
  lastSeen: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor({ limit, windowMs, maxKeys = 10_000 }: RateLimitOptions) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  consume(key: string, nowMs = Date.now()): RateLimitResult {
    this.prune(nowMs);

    const existing = this.buckets.get(key);
    const bucket = !existing || nowMs >= existing.resetAt
      ? { count: 0, resetAt: nowMs + this.windowMs, lastSeen: nowMs }
      : existing;

    bucket.lastSeen = nowMs;

    if (bucket.count >= this.limit) {
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, bucket.resetAt - nowMs),
      };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);

    return {
      allowed: true,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterMs: Math.max(0, bucket.resetAt - nowMs),
    };
  }

  private prune(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs >= bucket.resetAt) this.buckets.delete(key);
    }

    if (this.buckets.size <= this.maxKeys) return;

    const staleKeys = [...this.buckets.entries()]
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, this.buckets.size - this.maxKeys)
      .map(([key]) => key);

    for (const key of staleKeys) this.buckets.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwardedFor || "unknown";
}

export async function parseJsonBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new Error("Request body too large");
  }

  if (!body) return {};
  return JSON.parse(body);
}

export function normalizePassword(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0) return null;
  if (value.length > maxLength) throw new Error("Password too large");
  return value;
}
