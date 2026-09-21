import { z } from "zod";
import { moneyToDecimalString } from "@/shared/domain/money";
import type {
  CreateExternalCheckoutInput,
  ExternalCheckout,
  ExternalPaymentState,
  PaymentGateway,
  RefundOrderInput,
  ExternalRefundResult,
} from "../application/payment-gateway";
import { secureCheckoutUrl } from "../application/payment-redirect";
import { mercadoPagoExternalReference } from "../application/mercado-pago-reference";

const PRODUCTION_BASE_URL = "https://api.mercadopago.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 32_768;

const transactionSchema = z.object({
  payments: z.array(z.object({ id: z.string().min(1) }).passthrough()).optional(),
  refunds: z.array(z.object({
    id: z.string().min(1).optional(),
    amount: z.string(),
    status: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

const paymentStateSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  status_detail: z.string().nullable().optional(),
  external_reference: z.string().min(1).nullable().optional(),
  currency: z.string().length(3),
  total_amount: z.string().optional(),
  total_paid_amount: z.string().optional(),
  transactions: transactionSchema.optional(),
}).refine((value) => value.total_amount !== undefined || value.total_paid_amount !== undefined);

const checkoutSchema = paymentStateSchema.and(z.object({
  checkout_url: z.string().min(1),
  total_amount: z.string(),
}));

const refundResponseSchema = z.object({
  status: z.string().nullable().optional(),
  status_detail: z.string().nullable().optional(),
  transactions: transactionSchema.optional(),
}).passthrough();

const errorResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  errors: z.array(z.object({ code: z.string().optional() }).passthrough()).max(20).optional(),
}).passthrough();

export type PaymentGatewayErrorCode =
  | "TIMEOUT"
  | "NETWORK"
  | "AUTHENTICATION"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "RESOURCE_LOCKED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "TERMINAL_CONFLICT"
  | "INVALID_RESPONSE"
  | "PROVIDER_ERROR";

export class PaymentGatewayError extends Error {
  constructor(
    public readonly code: PaymentGatewayErrorCode,
    message: string,
    public readonly providerCode: string | null = null,
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

  async refundOrder(input: RefundOrderInput): Promise<ExternalRefundResult> {
    const resourceId = input.providerResourceId.trim();
    if (!resourceId || resourceId.length > 255 || input.amountInCents <= 0n) {
      throw new PaymentGatewayError("INVALID_REQUEST", "Solicitud de reembolso inválida.");
    }
    if (input.kind === "PARTIAL" && !input.paymentTransactionId) {
      throw new PaymentGatewayError("INVALID_REQUEST", "El reembolso parcial requiere una transacción de pago.");
    }
    const response = await this.request(`/v1/orders/${encodeURIComponent(resourceId)}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
      },
      ...(input.kind === "PARTIAL" ? {
        body: JSON.stringify({ transactions: [{
          id: input.paymentTransactionId,
          amount: moneyToDecimalString(input.amountInCents),
        }] }),
      } : {}),
    });
    const parsed = refundResponseSchema.safeParse(response);
    if (!parsed.success) throw invalidResponse();
    const refunds = parsed.data.transactions?.refunds ?? [];
    const ids = [...new Set(refunds.map((refund) => refund.id).filter((id): id is string => Boolean(id)))];
    return {
      providerRefundId: ids.length === 1 ? ids[0]! : null,
      providerStatus: parsed.data.status_detail ?? parsed.data.status ?? refunds.at(-1)?.status ?? null,
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
      const text = await readLimitedText(response);
      if (!response.ok) throw httpError(response.status, providerErrorCode(text));
      try { return JSON.parse(text) as unknown; }
      catch { throw invalidResponse(); }
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
  const payments = value.transactions?.payments ?? [];
  const paymentIds = [...new Set(payments.map((payment) => payment.id))];
  const refunds = value.transactions?.refunds;
  const isRefunded = value.status_detail === "partially_refunded"
    || value.status_detail === "refunded"
    || value.status === "refunded";
  let refundedAmountInCents: bigint | null = 0n;
  if (refunds) {
    try {
      refundedAmountInCents = refunds.reduce((sum, refund) => sum + decimalStringToCents(refund.amount), 0n);
    } catch {
      refundedAmountInCents = null;
    }
  } else if (isRefunded) {
    refundedAmountInCents = null;
  }
  return {
    provider: "MERCADO_PAGO",
    providerResourceId: value.id,
    providerStatus: value.status,
    providerStatusDetail: value.status_detail ?? null,
    externalReference: value.external_reference ?? null,
    currency: value.currency.toUpperCase(),
    totalAmountInCents: value.total_amount === undefined ? null : decimalStringToCents(value.total_amount),
    totalPaidAmountInCents: value.total_paid_amount === undefined ? null : decimalStringToCents(value.total_paid_amount),
    approvedAt: null,
    rejectedAt: null,
    refundedAmountInCents,
    paymentTransactionId: paymentIds.length === 1 ? paymentIds[0]! : null,
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

function httpError(status: number, providerCode: string | null): PaymentGatewayError {
  if (status === 400 || status === 422) return new PaymentGatewayError("INVALID_REQUEST", "Mercado Pago rechazó la solicitud.", providerCode);
  if (status === 401 || status === 403) return new PaymentGatewayError("AUTHENTICATION", "Mercado Pago no pudo autenticar la integración.");
  if (status === 404) return new PaymentGatewayError("NOT_FOUND", "Mercado Pago no encontró el recurso.", providerCode);
  if (status === 409 && providerCode === "idempotency_key_already_used") {
    return new PaymentGatewayError("IDEMPOTENCY_CONFLICT", "Mercado Pago informó un conflicto de idempotencia.", providerCode);
  }
  if (status === 409) return new PaymentGatewayError("TERMINAL_CONFLICT", "Mercado Pago no permite reembolsar el recurso.", providerCode);
  if (status === 423) return new PaymentGatewayError("RESOURCE_LOCKED", "Mercado Pago mantiene el recurso bloqueado temporalmente.", providerCode);
  if (status === 429) return new PaymentGatewayError("RATE_LIMITED", "Mercado Pago limitó temporalmente las solicitudes.");
  if (status >= 500) return new PaymentGatewayError("UNAVAILABLE", "Mercado Pago no está disponible temporalmente.");
  return new PaymentGatewayError("PROVIDER_ERROR", "Mercado Pago no pudo procesar la solicitud.");
}

async function readLimitedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let result = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw invalidResponse();
    }
    result += decoder.decode(chunk.value, { stream: true });
  }
  return result + decoder.decode();
}

function providerErrorCode(body: string): string | null {
  try {
    const parsed = errorResponseSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return null;
    const candidate = parsed.data.code ?? parsed.data.errors?.find((error) => error.code)?.code;
    return candidate && /^[a-z0-9_-]{1,100}$/i.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function invalidResponse(): PaymentGatewayError {
  return new PaymentGatewayError("INVALID_RESPONSE", "Mercado Pago devolvió una respuesta inválida.");
}
