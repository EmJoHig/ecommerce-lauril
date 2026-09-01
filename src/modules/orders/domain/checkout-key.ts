import { createHash, randomBytes } from "node:crypto";
import { ValidationError } from "@/shared/domain/errors";

const keyPattern = /^[A-Za-z0-9_-]{43}$/;

export function createCheckoutKey(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCheckoutKey(key: string): string {
  if (!keyPattern.test(key)) throw new ValidationError("La confirmación del checkout no es válida.");
  return createHash("sha256").update(key).digest("hex");
}
