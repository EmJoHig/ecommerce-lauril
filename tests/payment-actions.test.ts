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
  });

  it("resuelve ownership customer/guest antes de iniciar y solo redirige a la URL server-side", async () => {
    mocks.getCurrentCustomer.mockResolvedValueOnce({ id: "customer-1" }).mockResolvedValueOnce(null);
    mocks.getGuestOrderTokenHash.mockResolvedValue("guest-hash");

    await startPaymentCheckoutAction("10001", new FormData());
    await startPaymentCheckoutAction("10001", new FormData());

    expect(mocks.findPublic).toHaveBeenNthCalledWith(1, "10001", { customerId: "customer-1", guestTokenHash: null });
    expect(mocks.findPublic).toHaveBeenNthCalledWith(2, "10001", { customerId: null, guestTokenHash: "guest-hash" });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).toHaveBeenNthCalledWith(1, "https://checkout.mercadopago.test/order-1");
    expect(mocks.redirect).toHaveBeenNthCalledWith(2, "https://checkout.mercadopago.test/order-1");
  });
});
