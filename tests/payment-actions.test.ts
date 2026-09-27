import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentCustomer: vi.fn(),
  getGuestOrderTokenHash: vi.fn(),
  findPublic: vi.fn(),
  execute: vi.fn(),
  headers: vi.fn(),
  assertRateLimit: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/customers/presentation/customer-session", () => ({ getCurrentCustomer: mocks.getCurrentCustomer }));
vi.mock("@/modules/orders/presentation/guest-order-cookie", () => ({ getGuestOrderTokenHash: mocks.getGuestOrderTokenHash }));
vi.mock("@/modules/orders/infrastructure/order-composition", () => ({
  getOrderQueryService: () => ({ findPublic: mocks.findPublic }),
}));
vi.mock("@/modules/payments/infrastructure/payment-composition", () => ({
  isMercadoPagoCheckoutAvailable: () => true,
  getStartPaymentCheckout: () => ({ execute: mocks.execute }),
}));
vi.mock("@/shared/infrastructure/rate-limit", () => ({ assertRateLimit: mocks.assertRateLimit }));

import { startPaymentCheckoutAction } from "@/modules/payments/presentation/payment-actions";

describe("startPaymentCheckoutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mocks.findPublic.mockResolvedValue({ id: "10000000-0000-4000-8000-000000000001" });
    mocks.execute.mockResolvedValue({ checkoutUrl: "https://checkout.mercadopago.test/order-1" });
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  });

  it("rechaza guest aunque conserve token de pedido histórico", async () => {
    mocks.getCurrentCustomer.mockResolvedValue(null);
    mocks.getGuestOrderTokenHash.mockResolvedValue("guest-hash");
    await expect(startPaymentCheckoutAction("10001", new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.findPublic).not.toHaveBeenCalled();
    expect(mocks.getGuestOrderTokenHash).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("resuelve ownership con sesión y envía su identidad al caso de uso", async () => {
    mocks.getCurrentCustomer.mockResolvedValue({ id: "customer-1" });
    const form = new FormData();
    form.set("customerId", "customer-2");
    await expect(startPaymentCheckoutAction("10001", form)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.findPublic).toHaveBeenCalledWith("10001", { customerId: "customer-1", guestTokenHash: null });
    expect(mocks.execute).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001", "customer-1");
    expect(mocks.redirect).toHaveBeenCalledWith("https://checkout.mercadopago.test/order-1");
  });

  it("no inicia pago si la consulta por propietario rechaza el pedido", async () => {
    mocks.getCurrentCustomer.mockResolvedValue({ id: "customer-1" });
    mocks.findPublic.mockRejectedValue(new Error("Pedido ajeno"));
    await expect(startPaymentCheckoutAction("10001", new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/pedido/10001?payment_error=unavailable");
  });
});
