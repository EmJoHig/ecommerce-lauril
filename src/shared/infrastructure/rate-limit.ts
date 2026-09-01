import { createHash } from "node:crypto";
import { ConflictError } from "@/shared/domain/errors";

type Entry = { count: number; resetsAt: number };
const entries = new Map<string, Entry>();

export function assertRateLimit(input: {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): void {
  const now = input.now?.getTime() ?? Date.now();
  const key = `${input.scope}:${createHash("sha256").update(input.identity).digest("hex")}`;
  const current = entries.get(key);
  if (!current || current.resetsAt <= now) {
    entries.set(key, { count: 1, resetsAt: now + input.windowMs });
    return;
  }
  if (current.count >= input.limit) {
    throw new ConflictError("Demasiados intentos. Esperá unos minutos y volvé a probar.");
  }
  current.count += 1;
}
