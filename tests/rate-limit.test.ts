import { describe, expect, it } from "vitest";
import { ConflictError } from "@/shared/domain/errors";
import { InMemoryRateLimiter } from "@/shared/infrastructure/rate-limit";

const start = new Date("2026-09-14T12:00:00.000Z");

describe("InMemoryRateLimiter", () => {
  it("purga globalmente las entradas vencidas al necesitar capacidad", () => {
    const limiter = new InMemoryRateLimiter(2);
    limiter.assert({ scope: "test", identity: "a", limit: 1, windowMs: 1_000, now: start });
    limiter.assert({ scope: "test", identity: "b", limit: 1, windowMs: 1_000, now: start });

    const later = new Date(start.getTime() + 1_001);
    limiter.assert({ scope: "test", identity: "c", limit: 1, windowMs: 1_000, now: later });

    expect(limiter.entryCount).toBe(1);
    expect(() => limiter.assert({ scope: "test", identity: "c", limit: 1, windowMs: 1_000, now: later }))
      .toThrow(ConflictError);
  });

  it("mantiene el Map acotado y descarta primero la ventana más antigua", () => {
    const limiter = new InMemoryRateLimiter(2);
    limiter.assert({ scope: "test", identity: "oldest", limit: 1, windowMs: 60_000, now: start });
    limiter.assert({ scope: "test", identity: "second", limit: 1, windowMs: 60_000, now: start });
    limiter.assert({ scope: "test", identity: "newest", limit: 1, windowMs: 60_000, now: start });

    expect(limiter.entryCount).toBe(2);
    expect(() => limiter.assert({ scope: "test", identity: "oldest", limit: 1, windowMs: 60_000, now: start }))
      .not.toThrow();
    expect(limiter.entryCount).toBe(2);
  });
});
