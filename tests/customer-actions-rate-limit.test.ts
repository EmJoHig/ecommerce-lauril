import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, UnauthorizedError } from "@/shared/domain/errors";

const mocks = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  headers: vi.fn(),
  login: vi.fn(),
  requestPasswordReset: vi.fn(),
  withPasswordResetTiming: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
  loggerError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/infrastructure/rate-limit", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("@/shared/infrastructure/logger", () => ({ logger: { error: mocks.loggerError, warn: vi.fn() } }));
vi.mock("@/modules/cart/infrastructure/cart-composition", () => ({ getCartService: vi.fn() }));
vi.mock("@/modules/cart/presentation/guest-cart-cookie", () => ({
  deleteGuestCartCookie: vi.fn(),
  getGuestCartTokenHash: vi.fn(),
}));
vi.mock("@/modules/customers/infrastructure/customer-composition", () => ({
  getCustomerService: () => ({
    login: mocks.login,
    requestPasswordReset: mocks.requestPasswordReset,
  }),
}));
vi.mock("@/modules/customers/presentation/password-reset-timing", () => ({
  withPasswordResetTiming: mocks.withPasswordResetTiming,
}));
vi.mock("@/modules/customers/presentation/customer-session-cookie", () => ({
  deleteCustomerSessionCookie: vi.fn(),
  getCustomerSessionToken: vi.fn(),
  setCustomerSessionCookie: vi.fn(),
}));
vi.mock("@/modules/customers/presentation/customer-session", () => ({ requireCustomer: vi.fn() }));

import {
  loginCustomerAction,
  requestPasswordResetAction,
} from "@/modules/customers/presentation/customer-actions";
import { initialCustomerActionState } from "@/modules/customers/presentation/customer-action-state";

const genericRecoveryMessage = "Si el email corresponde a una cuenta activa, preparamos las instrucciones de recuperación.";

describe("customer auth rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({
      "x-forwarded-for": "198.51.100.99, 203.0.113.10",
    }));
    mocks.login.mockRejectedValue(new UnauthorizedError("Email o contraseña incorrectos."));
    mocks.requestPasswordReset.mockResolvedValue({ developmentPreviewUrl: null });
  });

  it("aplica límites independientes por IP y email normalizado al login cliente", async () => {
    const formData = new FormData();
    formData.set("email", "Cliente@Example.com");
    formData.set("password", "Clave-segura-123");

    await loginCustomerAction(initialCustomerActionState, formData);

    expect(mocks.assertRateLimit).toHaveBeenNthCalledWith(1, {
      scope: "login:ip",
      identity: "203.0.113.10",
      limit: 30,
      windowMs: 15 * 60_000,
    });
    expect(mocks.assertRateLimit).toHaveBeenNthCalledWith(2, {
      scope: "login:identity",
      identity: "cliente@example.com",
      limit: 8,
      windowMs: 15 * 60_000,
    });
  });

  it("cuenta inexistente, inactiva y activa devuelven la misma respuesta pública", async () => {
    for (const accountState of ["inexistente", "Customer inactivo", "cuenta activa"]) {
      const result = await requestPasswordResetAction(
        initialCustomerActionState,
        recoveryForm("Cliente@Example.com"),
      );

      expect(result, accountState).toEqual({
        status: "success",
        message: genericRecoveryMessage,
        developmentPreviewUrl: null,
      });
    }
    expect(mocks.withPasswordResetTiming).toHaveBeenCalledTimes(3);
  });

  it("conserva el rate limiting por IP e identidad en recuperación", async () => {
    mocks.assertRateLimit
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new ConflictError("Demasiados intentos. Esperá unos minutos y volvé a probar.");
      });

    const result = await requestPasswordResetAction(
      initialCustomerActionState,
      recoveryForm("Cliente@Example.com"),
    );

    expect(mocks.assertRateLimit).toHaveBeenNthCalledWith(1, {
      scope: "password-reset:ip",
      identity: "203.0.113.10",
      limit: 12,
      windowMs: 15 * 60_000,
    });
    expect(mocks.assertRateLimit).toHaveBeenNthCalledWith(2, {
      scope: "password-reset:identity",
      identity: "cliente@example.com",
      limit: 4,
      windowMs: 15 * 60_000,
    });
    expect(result).toEqual({
      status: "error",
      message: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
    });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("preserva el preview de desarrollo fuera de producción", async () => {
    const developmentPreviewUrl = "http://localhost:3000/restablecer-clave#token=preview-token";
    mocks.requestPasswordReset.mockResolvedValue({ developmentPreviewUrl });

    await expect(requestPasswordResetAction(
      initialCustomerActionState,
      recoveryForm("cliente@example.com"),
    )).resolves.toEqual({
      status: "success",
      message: genericRecoveryMessage,
      developmentPreviewUrl,
    });
  });

  it("un fallo técnico devuelve respuesta genérica y deja un log seguro", async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error(
      "Resend rechazó cliente@example.com con https://example.com/#token=secreto",
    ));

    const result = await requestPasswordResetAction(
      initialCustomerActionState,
      recoveryForm("cliente@example.com"),
    );

    expect(result).toEqual({ status: "success", message: genericRecoveryMessage });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "customer.password_reset_request_failed",
    );
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toMatch(
      /cliente@example\.com|token=|secreto/,
    );
  });
});

function recoveryForm(email: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}
