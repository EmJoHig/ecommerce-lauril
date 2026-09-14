import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/shared/domain/errors";

const mocks = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  headers: vi.fn(),
  login: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/infrastructure/rate-limit", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("@/shared/infrastructure/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/modules/cart/infrastructure/cart-composition", () => ({ getCartService: vi.fn() }));
vi.mock("@/modules/cart/presentation/guest-cart-cookie", () => ({
  deleteGuestCartCookie: vi.fn(),
  getGuestCartTokenHash: vi.fn(),
}));
vi.mock("@/modules/customers/infrastructure/customer-composition", () => ({
  getCustomerService: () => ({ login: mocks.login }),
}));
vi.mock("@/modules/customers/presentation/customer-session-cookie", () => ({
  deleteCustomerSessionCookie: vi.fn(),
  getCustomerSessionToken: vi.fn(),
  setCustomerSessionCookie: vi.fn(),
}));
vi.mock("@/modules/customers/presentation/customer-session", () => ({ requireCustomer: vi.fn() }));

import { loginCustomerAction } from "@/modules/customers/presentation/customer-actions";
import { initialCustomerActionState } from "@/modules/customers/presentation/customer-action-state";

describe("customer auth rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({
      "x-forwarded-for": "198.51.100.99, 203.0.113.10",
    }));
    mocks.login.mockRejectedValue(new UnauthorizedError("Email o contraseña incorrectos."));
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
});
