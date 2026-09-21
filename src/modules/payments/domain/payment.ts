import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";

export const paymentProviders = ["MERCADO_PAGO"] as const;
export type PaymentProvider = (typeof paymentProviders)[number];

export const paymentAttemptStatuses = [
  "CREATED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "REQUIRES_REVIEW",
] as const;
export type PaymentAttemptStatus = (typeof paymentAttemptStatuses)[number];

export const paymentEventProcessingStatuses = [
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED",
] as const;
export type PaymentEventProcessingStatus = (typeof paymentEventProcessingStatuses)[number];

export type PaymentAttempt = Readonly<{
  id: string;
  orderId: string;
  provider: PaymentProvider;
  attemptNumber: number;
  idempotencyKey: string;
  status: PaymentAttemptStatus;
  amountInCents: bigint;
  currency: string;
  providerResourceId: string | null;
  checkoutUrl: string | null;
  providerStatus: string | null;
  providerStatusDetail: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  refundedAmountInCents: bigint;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PaymentEvent = Readonly<{
  id: string;
  provider: PaymentProvider;
  providerEventId: string;
  providerResourceId: string;
  eventType: string;
  action: string | null;
  requestId: string | null;
  paymentAttemptId: string | null;
  processingStatus: PaymentEventProcessingStatus;
  receivedAt: Date;
  processedAt: Date | null;
  createdAt: Date;
}>;

export function createPaymentAttempt(
  input: Readonly<{
    orderId: string;
    provider: PaymentProvider;
    attemptNumber: number;
    amountInCents: bigint;
    currency: string;
  }>,
  now = new Date(),
): PaymentAttempt {
  const orderId = z.uuid().parse(input.orderId);
  if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new ValidationError("El número de intento debe ser un entero positivo.");
  }
  if (input.amountInCents < 0n) {
    throw new ValidationError("El importe del intento no puede ser negativo.");
  }
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationError("La moneda del intento debe usar un código ISO de tres letras.");
  }

  return {
    id: randomUUID(),
    orderId,
    provider: input.provider,
    attemptNumber: input.attemptNumber,
    idempotencyKey: randomUUID(),
    status: "CREATED",
    amountInCents: input.amountInCents,
    currency,
    providerResourceId: null,
    checkoutUrl: null,
    providerStatus: null,
    providerStatusDetail: null,
    approvedAt: null,
    rejectedAt: null,
    refundedAmountInCents: 0n,
    createdAt: now,
    updatedAt: now,
  };
}

export function createPaymentEvent(
  input: Readonly<{
    provider: PaymentProvider;
    providerEventId: string;
    providerResourceId: string;
    eventType: string;
    action?: string | null;
    requestId?: string | null;
    paymentAttemptId?: string | null;
    receivedAt?: Date;
  }>,
): PaymentEvent {
  const receivedAt = input.receivedAt ?? new Date();
  return {
    id: randomUUID(),
    provider: input.provider,
    providerEventId: requiredMetadata(input.providerEventId, "providerEventId"),
    providerResourceId: requiredMetadata(input.providerResourceId, "providerResourceId"),
    eventType: requiredMetadata(input.eventType, "eventType"),
    action: optionalMetadata(input.action),
    requestId: optionalMetadata(input.requestId),
    paymentAttemptId: input.paymentAttemptId ? z.uuid().parse(input.paymentAttemptId) : null,
    processingStatus: "RECEIVED",
    receivedAt,
    processedAt: null,
    createdAt: receivedAt,
  };
}

function requiredMetadata(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) {
    throw new ValidationError(`${field} debe contener entre 1 y 255 caracteres.`);
  }
  return normalized;
}

function optionalMetadata(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return requiredMetadata(value, "metadata");
}
