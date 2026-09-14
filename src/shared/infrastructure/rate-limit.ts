import { createHash } from "node:crypto";
import { ConflictError } from "@/shared/domain/errors";

type Entry = { count: number; resetsAt: number };

export const RATE_LIMIT_MAX_ENTRIES = 10_000;
const CLEANUP_INTERVAL = 100;

export type RateLimitInput = {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, Entry>();
  private operationsUntilCleanup = CLEANUP_INTERVAL;

  constructor(private readonly maxEntries = RATE_LIMIT_MAX_ENTRIES) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("maxEntries debe ser un entero positivo.");
    }
  }

  get entryCount(): number {
    return this.entries.size;
  }

  assert(input: RateLimitInput): void {
    const now = input.now?.getTime() ?? Date.now();
    this.operationsUntilCleanup -= 1;
    if (this.operationsUntilCleanup === 0) {
      this.purgeExpired(now);
      this.operationsUntilCleanup = CLEANUP_INTERVAL;
    }

    const key = `${input.scope}:${createHash("sha256").update(input.identity).digest("hex")}`;
    const current = this.entries.get(key);
    if (!current || current.resetsAt <= now) {
      if (current) this.entries.delete(key);
      this.entries.set(key, { count: 1, resetsAt: now + input.windowMs });
      this.enforceMaximum(now);
      return;
    }
    if (current.count >= input.limit) {
      throw new ConflictError("Demasiados intentos. Esperá unos minutos y volvé a probar.");
    }
    current.count += 1;
  }

  private purgeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetsAt <= now) this.entries.delete(key);
    }
  }

  private enforceMaximum(now: number): void {
    if (this.entries.size <= this.maxEntries) return;
    this.purgeExpired(now);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}

const limiter = new InMemoryRateLimiter();

export function assertRateLimit(input: RateLimitInput): void {
  limiter.assert(input);
}
