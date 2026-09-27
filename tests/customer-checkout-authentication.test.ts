import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerService } from "@/modules/customers/application/customer-service";
import type { CustomerRecord, CustomerRepository } from "@/modules/customers/application/customer-repository";

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(), findSession: vi.fn(), getToken: vi.fn(), setCookie: vi.fn(),
  login: vi.fn(), register: vi.fn(), merge: vi.fn(), guestHash: vi.fn(), deleteGuestCookie: vi.fn(),
  redirect: vi.fn(), confirm: vi.fn(), prepare: vi.fn(), execute: vi.fn(), findPublic: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/infrastructure/rate-limit", () => ({ assertRateLimit: vi.fn() }));
vi.mock("@/shared/infrastructure/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/modules/customers/infrastructure/customer-composition", () => ({ getCustomerService: () => ({
  findSession: mocks.findSession, login: mocks.login, register: mocks.register,
}) }));
vi.mock("@/modules/customers/presentation/customer-session-cookie", () => ({
  getCustomerSessionToken: mocks.getToken, setCustomerSessionCookie: mocks.setCookie, deleteCustomerSessionCookie: vi.fn(),
}));
vi.mock("@/modules/cart/infrastructure/cart-composition", () => ({ getCartService: () => ({ mergeGuestCart: mocks.merge }) }));
vi.mock("@/modules/cart/presentation/guest-cart-cookie", () => ({ getGuestCartTokenHash: mocks.guestHash, deleteGuestCartCookie: mocks.deleteGuestCookie }));
vi.mock("@/modules/orders/infrastructure/order-composition", () => ({
  getCheckoutService: () => ({ confirm: mocks.confirm, prepare: mocks.prepare }),
  getOrderQueryService: () => ({ findPublic: mocks.findPublic }),
}));
vi.mock("@/modules/orders/presentation/checkout-form", () => ({ CheckoutForm: () => null }));
vi.mock("@/modules/payments/infrastructure/payment-composition", () => ({
  getStartPaymentCheckout: () => ({ execute: mocks.execute }), isMercadoPagoCheckoutAvailable: () => true,
}));

import CheckoutPage from "@/app/(store)/checkout/page";
import { confirmCheckoutAction } from "@/modules/orders/presentation/checkout-actions";
import { startPaymentCheckoutAction } from "@/modules/payments/presentation/payment-actions";
import { loginCustomerAction, registerCustomerAction } from "@/modules/customers/presentation/customer-actions";
import { customerReturnPath } from "@/modules/customers/presentation/customer-return-path";
import { initialCustomerActionState } from "@/modules/customers/presentation/customer-action-state";
import { initialCheckoutActionState } from "@/modules/orders/presentation/checkout-action-state";

const customer: CustomerRecord = {
  id: "10000000-0000-4000-8000-000000000002", userId: "10000000-0000-4000-8000-000000000003",
  firstName: "Ana", lastName: "Prueba", email: "ana@example.com", phone: "123456", document: null,
  passwordHash: "unused", status: "ACTIVE", userStatus: "ACTIVE", createdAt: new Date(), updatedAt: new Date(),
};
const expiresAt = new Date(Date.now() + 86_400_000);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  mocks.getToken.mockResolvedValue("session-token");
  const service = new CustomerService({ findSessionByTokenHash: mocks.readSession } as unknown as CustomerRepository, {
    sendPasswordReset: vi.fn(), sendContactMessage: vi.fn(),
  });
  mocks.findSession.mockImplementation((token: string) => service.findSession(token));
  mocks.readSession.mockResolvedValue({ expiresAt, revokedAt: null, customer });
  mocks.login.mockResolvedValue({ token: "session-token", expiresAt, customer });
  mocks.register.mockResolvedValue({ token: "session-token", expiresAt, customer });
  mocks.guestHash.mockResolvedValue("a".repeat(64));
  mocks.merge.mockResolvedValue({ merged: true, adjustedLines: 0, removedLines: 0 });
  mocks.confirm.mockResolvedValue({ order: { number: 10001n } });
});

describe("fronteras de checkout autenticado", () => {
  it("guest es redirigido antes de preparar checkout y conserva su cookie", async () => {
    mocks.getToken.mockResolvedValue(null);
    await expect(CheckoutPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?returnTo=/checkout");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.deleteGuestCookie).not.toHaveBeenCalled();
  });

  it("checkout tolera parámetros carrito repetidos sin perder el formulario", async () => {
    mocks.prepare.mockResolvedValue({ buyer: customer, addresses: [], items: [], shippingQuotes: [], itemsSubtotalInCents: 0n });
    const searchParams = Promise.resolve({ carrito: ["fusionado", "ajustado-1-0"] });
    await expect(CheckoutPage({ searchParams })).resolves.toMatchObject({ type: "section" });
    expect(mocks.prepare).toHaveBeenCalledWith({ kind: "customer", customerId: customer.id });
    expect(mocks.deleteGuestCookie).not.toHaveBeenCalled();
  });

  it("sesiones inexistentes, vencidas, revocadas y cuentas inactivas no confirman ni pagan", async () => {
    for (const record of [
      null,
      { expiresAt: new Date(0), revokedAt: null, customer },
      { expiresAt, revokedAt: new Date(), customer },
      { expiresAt, revokedAt: null, customer: { ...customer, status: "DISABLED" } },
      { expiresAt, revokedAt: null, customer: { ...customer, userStatus: "DISABLED" } },
    ]) {
      mocks.readSession.mockResolvedValue(record);
      await expect(confirmCheckoutAction(initialCheckoutActionState, new FormData())).rejects.toThrow("NEXT_REDIRECT");
      await expect(startPaymentCheckoutAction("10001", new FormData())).rejects.toThrow("NEXT_REDIRECT");
    }
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.findPublic).not.toHaveBeenCalled();
  });

  it.each([loginCustomerAction, registerCustomerAction])("autenticación fusiona antes de volver a checkout y usa la identidad de sesión", async (authenticate) => {
    await expect(authenticate(initialCustomerActionState, authForm("/checkout"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.setCookie).toHaveBeenCalledWith("session-token", expiresAt);
    expect(mocks.merge).toHaveBeenCalledWith(customer.id, "a".repeat(64));
    expect(mocks.merge.mock.invocationCallOrder[0]!).toBeLessThan(mocks.deleteGuestCookie.mock.invocationCallOrder[0]!);
    expect(mocks.deleteGuestCookie.mock.invocationCallOrder[0]!).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]!);
    expect(mocks.redirect).toHaveBeenCalledWith("/checkout?carrito=fusionado");
    const form = new FormData();
    form.set("checkoutKey", "A".repeat(43));
    form.set("shippingMethodId", "10000000-0000-4000-8000-000000000007");
    form.set("customerId", "identidad-manipulada");
    await expect(confirmCheckoutAction(initialCheckoutActionState, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ owner: { kind: "customer", customerId: customer.id } }));
  });

  it("una fusión fallida conserva la cookie y el aviso actual sin saltar a checkout", async () => {
    mocks.merge.mockRejectedValue(new Error("conflict"));
    await expect(loginCustomerAction(initialCustomerActionState, authForm("/checkout"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.deleteGuestCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/mi-cuenta?carrito=pendiente");
  });

  it("limita returnTo a destinos exactos tanto en login como en registro", async () => {
    for (const value of ["https://attacker.test", "//attacker.test", "/\\attacker.test", "javascript:alert(1)", "/checkout?next=https://attacker.test", ["/checkout"], null]) {
      expect(customerReturnPath(value)).toBe("/mi-cuenta");
    }
    for (const authenticate of [loginCustomerAction, registerCustomerAction]) {
      await expect(authenticate(initialCustomerActionState, authForm("https://attacker.test"))).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.redirect).toHaveBeenLastCalledWith("/mi-cuenta?carrito=fusionado");
    }
  });
});

function authForm(returnTo: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ firstName: "Ana", lastName: "Prueba", email: "ana@example.com", phone: "123456", password: "Clave-segura-123", passwordConfirmation: "Clave-segura-123", returnTo })) form.set(key, value);
  return form;
}
