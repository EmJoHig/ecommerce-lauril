import { z } from "zod";
import { moneyToDecimalString } from "@/shared/domain/money";
import type {
  CreateExternalCheckoutInput,
  ExternalCheckout,
  ExternalPaymentState,
  PaymentGateway,
} from "../application/payment-gateway";
import { secureCheckoutUrl } from "../application/payment-redirect";
import { mercadoPagoExternalReference } from "../application/mercado-pago-reference";

const PRODUCTION_BASE_URL = "https://api.mercadopago.com";
const DEFAULT_TIMEOUT_MS = 10_000;

const paymentStateSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  status_detail: z.string().nullable(),
  external_reference: z.string().min(1).nullable().optional(),
  currency: z.string().length(3),
  total_amount: z.string().optional(),
  total_paid_amount: z.string().optional(),
}).refine((value) => value.total_amount !== undefined || value.total_paid_amount !== undefined);

const checkoutSchema = paymentStateSchema.and(z.object({
  checkout_url: z.string().min(1),
  total_amount: z.string(),
}));

export type PaymentGatewayErrorCode =
  | "TIMEOUT"
  | "NETWORK"
  | "AUTHENTICATION"
  | "INVALID_REQUEST"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "PROVIDER_ERROR";

export class PaymentGatewayError extends Error {
  constructor(
    public readonly code: PaymentGatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class MercadoPagoOrdersGateway implements PaymentGateway {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(
    private readonly accessToken: string,
    private readonly appUrl: string,
    options: Readonly<{
      fetchFn?: FetchLike;
      baseUrl?: string;
      timeoutMs?: number;
    }> = {},
  ) {
    if (!accessToken.trim()) throw new Error("MERCADO_PAGO_ACCESS_TOKEN no está configurado.");
    this.baseUrl = (options.baseUrl ?? PRODUCTION_BASE_URL).replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createCheckout(input: CreateExternalCheckoutInput): Promise<ExternalCheckout> {
    assertArgentineCurrency(input.currency);
    const totalAmount = moneyToDecimalString(input.amountInCents);
    const orderPath = `/pedido/${input.orderNumber.toString()}`;
    const payload = {
      type: "online",
      processing_mode: "manual",
      total_amount: totalAmount,
      external_reference: mercadoPagoExternalReference(input.orderNumber, input.attemptNumber),
      description: `Pedido Lauril #${input.orderNumber.toString()}`,
      payer: { email: input.payerEmail },
      config: {
        online: {
          success_url: returnUrl(this.appUrl, orderPath, "success"),
          failure_url: returnUrl(this.appUrl, orderPath, "failure"),
          pending_url: returnUrl(this.appUrl, orderPath, "pending"),
          auto_return: "all",
        },
      },
    };
    const response = await this.request("/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    const parsed = checkoutSchema.safeParse(response);
    if (!parsed.success) throw invalidResponse();
    const state = normalizeState(parsed.data);
    if (state.currency !== "ARS" || state.totalAmountInCents !== input.amountInCents) {
      throw invalidResponse();
    }
    return { ...state, checkoutUrl: secureCheckoutUrl(parsed.data.checkout_url) };
  }

  async getPaymentState(providerResourceId: string): Promise<ExternalPaymentState> {
    const resourceId = providerResourceId.trim();
    if (!resourceId || resourceId.length > 255) throw new PaymentGatewayError("INVALID_REQUEST", "Referencia de pago inválida.");
    const response = await this.request(`/v1/orders/${encodeURIComponent(resourceId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const parsed = paymentStateSchema.safeParse(response);
    if (!parsed.success) throw invalidResponse();
    const state = normalizeState(parsed.data);
    assertArgentineCurrency(state.currency);
    return state;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      if (!response.ok) throw httpError(response.status);
      try {
        return await response.json();
      } catch {
        throw invalidResponse();
      }
    } catch (error) {
      if (error instanceof PaymentGatewayError) throw error;
      if (controller.signal.aborted) {
        throw new PaymentGatewayError("TIMEOUT", "Mercado Pago no respondió a tiempo.");
      }
      throw new PaymentGatewayError("NETWORK", "No se pudo conectar con Mercado Pago.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeState(value: z.infer<typeof paymentStateSchema>): ExternalPaymentState {
  return {
    provider: "MERCADO_PAGO",
    providerResourceId: value.id,
    providerStatus: value.status,
    providerStatusDetail: value.status_detail,
    externalReference: value.external_reference ?? null,
    currency: value.currency.toUpperCase(),
    totalAmountInCents: value.total_amount === undefined ? null : decimalStringToCents(value.total_amount),
    totalPaidAmountInCents: value.total_paid_amount === undefined ? null : decimalStringToCents(value.total_paid_amount),
    approvedAt: null,
    rejectedAt: null,
    refundedAmountInCents: 0n,
  };
}

function decimalStringToCents(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw invalidResponse();
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
}

function assertArgentineCurrency(currency: string): void {
  if (currency.trim().toUpperCase() !== "ARS") {
    throw new PaymentGatewayError("INVALID_REQUEST", "Mercado Pago Argentina requiere moneda ARS.");
  }
}

function returnUrl(appUrl: string, path: string, state: "success" | "failure" | "pending"): string {
  const url = new URL(path, appUrl);
  url.searchParams.set("payment_return", state);
  return url.toString();
}

function httpError(status: number): PaymentGatewayError {
  if (status === 400) return new PaymentGatewayError("INVALID_REQUEST", "Mercado Pago rechazó la solicitud.");
  if (status === 401 || status === 403) return new PaymentGatewayError("AUTHENTICATION", "Mercado Pago no pudo autenticar la integración.");
  if (status === 409) return new PaymentGatewayError("IDEMPOTENCY_CONFLICT", "Mercado Pago informó un conflicto de idempotencia.");
  if (status === 429) return new PaymentGatewayError("RATE_LIMITED", "Mercado Pago limitó temporalmente las solicitudes.");
  if (status >= 500) return new PaymentGatewayError("UNAVAILABLE", "Mercado Pago no está disponible temporalmente.");
  return new PaymentGatewayError("PROVIDER_ERROR", "Mercado Pago no pudo procesar la solicitud.");
}

function invalidResponse(): PaymentGatewayError {
  return new PaymentGatewayError("INVALID_RESPONSE", "Mercado Pago devolvió una respuesta inválida.");
}
