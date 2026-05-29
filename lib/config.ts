const DEV_SECRET = "ewm-dev-secret-change-in-prod";

export function getEwmSecret(
  env: Partial<Record<"EWM_SECRET" | "NODE_ENV", string>> = process.env,
): string {
  const secret = env.EWM_SECRET?.trim();

  if (secret) return secret;

  if (env.NODE_ENV === "production") {
    throw new Error("EWM_SECRET is required in production");
  }

  return DEV_SECRET;
}
