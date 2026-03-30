import { hash, verify } from "@node-rs/argon2";
import { createHmac } from "crypto";
import { EWM_SECRET, COOKIE_MAX_AGE } from "./constants";

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  hashedPassword: string,
  password: string
): Promise<boolean> {
  return verify(hashedPassword, password);
}

function sign(value: string): string {
  const signature = createHmac("sha256", EWM_SECRET)
    .update(value)
    .digest("base64url");
  return `${value}.${signature}`;
}

function unsign(signedValue: string): string | null {
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signedValue.slice(0, lastDot);
  if (sign(value) !== signedValue) return null;
  return value;
}

export function createAuthCookie(noteId: string): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  const expires = Date.now() + COOKIE_MAX_AGE * 1000;
  const payload = `${noteId}:${expires}`;
  return {
    name: `ewm_${noteId}`,
    value: sign(payload),
    options: {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    },
  };
}

export function verifyAuthCookie(
  noteId: string,
  cookieValue: string | undefined
): boolean {
  if (!cookieValue) return false;
  const payload = unsign(cookieValue);
  if (!payload) return false;
  const [id, expiresStr] = payload.split(":");
  if (id !== noteId) return false;
  const expires = parseInt(expiresStr, 10);
  if (Date.now() > expires) return false;
  return true;
}
