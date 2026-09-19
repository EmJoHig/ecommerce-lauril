import { describe, expect, it, vi } from "vitest";
import {
  MercadoPagoOrdersGateway,
  PaymentGatewayError,
} from "@/modules/payments/infrastructure/mercado-pago-orders-gateway";

const token = "TEST_ACCESS_TOKEN_DO_NOT_EXPOSE";
const input = {
  idempotencyKey: "10000000-0000-4000-8000-000000000010",
  orderId: "10000000-0000-4000-8000-000000000001",
  orderNumber: 10001n,
  attemptNumber: 2,
  amountInCents: 4600n,
  currency: "ARS",
  payerEmail: "buyer@example.com",
} as const;

describe("MercadoPagoOrdersGateway", () => {
  it("crea una order online/manual con dinero decimal, idempotencia y retornos del pedido", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      id: "mp-order-1",
      status: "created",
      status_detail: "pending_payment",
      external_reference: "lauril-order-10001-attempt-2",
      checkout_url: "https://checkout.mercadopago.test/order-1",
      currency: "ARS",
      total_amount: "46.00",
    }));
    const gateway = gatewayWith(fetchFn);

    const result = await gateway.createCheckout(input);

    expect(result).toMatchObject({
      providerResourceId: "mp-order-1",
      checkoutUrl: "https://checkout.mercadopago.test/order-1",
      providerStatus: "created",
      providerStatusDetail: "pending_payment",
      externalReference: "lauril-order-10001-attempt-2",
      currency: "ARS",
      totalAmountInCents: 4600n,
    });
    expect(Object.values(result).map(String).join(" ")).not.toContain(token);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/orders");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
      },
    });
    expect(JSON.parse(init.body)).toEqual({
      type: "online",
      processing_mode: "manual",
      total_amount: "46.00",
      external_reference: "lauril-order-10001-attempt-2",
      description: "Pedido Lauril #10001",
      payer: { email: "buyer@example.com" },
      config: { online: {
        success_url: "https://lauril.test/pedido/10001?payment_return=success",
        failure_url: "https://lauril.test/pedido/10001?payment_return=failure",
        pending_url: "https://lauril.test/pedido/10001?payment_return=pending",
        auto_return: "all",
      } },
    });
  });

  it("mapea errores HTTP/red sin leer el body ni exponer el Access Token", async () => {
    const cases = [
      [400, "INVALID_REQUEST"], [401, "AUTHENTICATION"], [403, "AUTHENTICATION"],
      [409, "IDEMPOTENCY_CONFLICT"], [429, "RATE_LIMITED"], [503, "UNAVAILABLE"],
    ] as const;
    for (const [status, code] of cases) {
      const error = await gatewayWith(vi.fn().mockResolvedValue(new Response(token, { status })))
        .createCheckout(input).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PaymentGatewayError);
      expect(error).toMatchObject({ code });
      expect(String(error)).not.toContain(token);
    }
    const networkError = await gatewayWith(vi.fn().mockRejectedValue(new Error(token)))
      .createCheckout(input).catch((caught: unknown) => caught);
    expect(networkError).toMatchObject({ code: "NETWORK" });
    expect(String(networkError)).not.toContain(token);
  });

  it("consulta el estado autoritativo con GET y normaliza importes sin Number", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      id: "mp/order 1",
      status: "processed",
      status_detail: "accredited",
      external_reference: "lauril-order-10001-attempt-2",
      currency: "ARS",
      total_amount: "1234.56",
      total_paid_amount: "1234.56",
    }));
    const state = await gatewayWith(fetchFn).getPaymentState("mp/order 1");

    expect(fetchFn).toHaveBeenCalledWith("https://api.test/v1/orders/mp%2Forder%201", expect.objectContaining({ method: "GET" }));
    expect(state).toMatchObject({
      providerResourceId: "mp/order 1",
      providerStatus: "processed",
      providerStatusDetail: "accredited",
      externalReference: "lauril-order-10001-attempt-2",
      totalAmountInCents: 123456n,
      totalPaidAmountInCents: 123456n,
    });
  });

  it("rechaza respuestas 2xx incompletas y checkout URLs no HTTPS", async () => {
    const invalid = gatewayWith(vi.fn().mockResolvedValue(jsonResponse({ status: "created" })))
      .createCheckout(input);
    await expect(invalid).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    const unsafe = gatewayWith(vi.fn().mockResolvedValue(jsonResponse({
      id: "mp-order-1", status: "created", status_detail: null,
      checkout_url: "javascript:alert(1)", currency: "ARS", total_amount: "46.00",
    }))).createCheckout(input);
    await expect(unsafe).rejects.toThrow("URL de checkout insegura");
  });
});

function gatewayWith(fetchFn: ReturnType<typeof vi.fn>) {
  return new MercadoPagoOrdersGateway(token, "https://lauril.test", {
    fetchFn: fetchFn as unknown as typeof fetch,
    baseUrl: "https://api.test",
    timeoutMs: 100,
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
