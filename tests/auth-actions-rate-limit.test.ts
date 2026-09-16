import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/shared/domain/errors";

const mocks = vi.hoisted(() => ({
  currentIp: "203.0.113.1",
  cookies: vi.fn(),
  cookieDelete: vi.fn(),
  headers: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/shared/infrastructure/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}));
vi.mock("@/shared/infrastructure/env", () => ({
  getServerEnv: () => ({ NODE_ENV: "test", SESSION_COOKIE_NAME: "admin_session", SESSION_TTL_DAYS: 7 }),
}));
vi.mock("@/modules/auth/infrastructure/auth-composition", () => ({
  getAuthService: () => ({ login: mocks.login, logout: mocks.logout }),
}));

import { loginAction, logoutAction } from "@/modules/auth/presentation/auth-actions";

describe("loginAction rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockImplementation(async () => new Headers({
      "x-forwarded-for": `198.51.100.250, ${mocks.currentIp}`,
    }));
    mocks.cookies.mockResolvedValue({
      delete: mocks.cookieDelete,
      get: () => ({ value: "admin-session-token-fixture" }),
      set: vi.fn(),
    });
    mocks.login.mockRejectedValue(new UnauthorizedError("Email o contraseña incorrectos."));
    mocks.logout.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  });

  it("registra rechazos reales pero no duplica authentication_failed al bloquear por identidad", async () => {
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      mocks.currentIp = `203.0.113.${attempt}`;
      await expect(loginAction(loginForm("Admin@Example.com"))).rejects.toThrow("NEXT_REDIRECT");
    }

    expect(mocks.login).toHaveBeenCalledTimes(8);
    expect(mocks.redirect).toHaveBeenLastCalledWith("/admin/login?error=invalid-credentials");
    expect(mocks.loggerWarn.mock.calls.filter(([event]) => event === "security.authentication_failed"))
      .toHaveLength(8);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "security.authentication_failed",
      { surface: "admin" },
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "security.rate_limit_blocked",
      { scope: "admin-login:identity", limit: 8, windowMs: 15 * 60_000 },
    );
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toMatch(
      /admin@example\.com|clave-segura-123/i,
    );
  });

  it("bloquea por IP aunque cambie el email y no invoca login al superar 30 intentos", async () => {
    mocks.currentIp = "203.0.113.200";
    for (let attempt = 1; attempt <= 31; attempt += 1) {
      await expect(loginAction(loginForm(`admin-${attempt}@example.com`))).rejects.toThrow("NEXT_REDIRECT");
    }

    expect(mocks.login).toHaveBeenCalledTimes(30);
    expect(mocks.redirect).toHaveBeenLastCalledWith("/admin/login?error=invalid-credentials");
  });

  it("registra logout admin solo después de revocar una sesión existente", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.logout).toHaveBeenCalledWith("admin-session-token-fixture");
    expect(mocks.loggerInfo).toHaveBeenCalledWith("security.logout", { surface: "admin" });
    expect(mocks.logout.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.loggerInfo.mock.invocationCallOrder[0]!,
    );
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain("admin-session-token-fixture");
  });
});

function loginForm(email: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", "Clave-segura-123");
  return formData;
}
