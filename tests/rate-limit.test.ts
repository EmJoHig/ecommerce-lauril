import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@/shared/domain/errors";
import { logger } from "@/shared/infrastructure/logger";
import { assertRateLimit, InMemoryRateLimiter } from "@/shared/infrastructure/rate-limit";

const start = new Date("2026-09-14T12:00:00.000Z");

describe("InMemoryRateLimiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("registra de forma segura únicamente los bloqueos del wrapper y conserva el error", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const input = {
      scope: "security-test:identity",
      identity: "cliente-sensible@example.com",
      limit: 1,
      windowMs: 60_000,
      now: start,
    };

    expect(() => assertRateLimit(input)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();

    let blockedError: unknown;
    try {
      assertRateLimit(input);
    } catch (error) {
      blockedError = error;
    }

    expect(blockedError).toBeInstanceOf(ConflictError);
    expect((blockedError as Error).message).toBe(
      "Demasiados intentos. Esperá unos minutos y volvé a probar.",
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("security.rate_limit_blocked", {
      scope: input.scope,
      limit: input.limit,
      windowMs: input.windowMs,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(input.identity);
  });
});
