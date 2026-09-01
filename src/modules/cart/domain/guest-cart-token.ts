import { createHash, randomBytes } from "node:crypto";

export function createGuestCartToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestCartToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isGuestCartToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
