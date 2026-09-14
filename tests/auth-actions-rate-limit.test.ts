import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/shared/domain/errors";

const mocks = vi.hoisted(() => ({
  currentIp: "203.0.113.1",
  headers: vi.fn(),
  login: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: mocks.headers,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/shared/infrastructure/env", () => ({
  getServerEnv: () => ({ NODE_ENV: "test", SESSION_COOKIE_NAME: "admin_session", SESSION_TTL_DAYS: 7 }),
}));
vi.mock("@/modules/auth/infrastructure/auth-composition", () => ({
  getAuthService: () => ({ login: mocks.login }),
}));

import { loginAction } from "@/modules/auth/presentation/auth-actions";

describe("loginAction rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockImplementation(async () => new Headers({
      "x-forwarded-for": `198.51.100.250, ${mocks.currentIp}`,
    }));
    mocks.login.mockRejectedValue(new UnauthorizedError("Email o contraseña incorrectos."));
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  });

  it("bloquea por email normalizado aunque cambie la IP y no invoca login al superar 8 intentos", async () => {
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      mocks.currentIp = `203.0.113.${attempt}`;
      await expect(loginAction(loginForm("Admin@Example.com"))).rejects.toThrow("NEXT_REDIRECT");
    }

    expect(mocks.login).toHaveBeenCalledTimes(8);
    expect(mocks.redirect).toHaveBeenLastCalledWith("/admin/login?error=invalid-credentials");
  });

  it("bloquea por IP aunque cambie el email y no invoca login al superar 30 intentos", async () => {
    mocks.currentIp = "203.0.113.200";
    for (let attempt = 1; attempt <= 31; attempt += 1) {
      await expect(loginAction(loginForm(`admin-${attempt}@example.com`))).rejects.toThrow("NEXT_REDIRECT");
    }

    expect(mocks.login).toHaveBeenCalledTimes(30);
    expect(mocks.redirect).toHaveBeenLastCalledWith("/admin/login?error=invalid-credentials");
  });
});

function loginForm(email: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", "Clave-segura-123");
  return formData;
}
