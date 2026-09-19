import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ValidationError } from "@/shared/domain/errors";
import type { PaymentProvider } from "./payment";

export const paymentRefundKinds = ["FULL", "PARTIAL"] as const;
export type PaymentRefundKind = (typeof paymentRefundKinds)[number];

export const paymentRefundStatuses = [
  "CREATED", "SUBMITTED", "CONFIRMED", "FAILED", "REQUIRES_REVIEW",
] as const;
export type PaymentRefundStatus = (typeof paymentRefundStatuses)[number];

export type PaymentRefund = Readonly<{
  id: string;
  paymentAttemptId: string;
  provider: PaymentProvider;
  providerResourceId: string;
  kind: PaymentRefundKind;
  amountInCents: bigint;
  paymentTransactionId: string | null;
  idempotencyKey: string;
  status: PaymentRefundStatus;
  providerRefundId: string | null;
  providerStatus: string | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  confirmedAt: Date | null;
}>;

export function createPaymentRefund(input: Readonly<{
  paymentAttemptId: string;
  provider: PaymentProvider;
  providerResourceId: string;
  kind: PaymentRefundKind;
  amountInCents: bigint;
  paymentTransactionId: string | null;
}>, now = new Date()): PaymentRefund {
  if (input.amountInCents <= 0n) throw new ValidationError("El importe del reembolso debe ser positivo.");
  const providerResourceId = input.providerResourceId.trim();
  if (!providerResourceId || providerResourceId.length > 255) {
    throw new ValidationError("La referencia externa del pago es inválida.");
  }
  if (input.kind === "PARTIAL" && !input.paymentTransactionId) {
    throw new ValidationError("El reembolso parcial requiere una transacción de pago inequívoca.");
  }
  return {
    id: randomUUID(),
    paymentAttemptId: z.uuid().parse(input.paymentAttemptId),
    provider: input.provider,
    providerResourceId,
    kind: input.kind,
    amountInCents: input.amountInCents,
    paymentTransactionId: input.paymentTransactionId,
    idempotencyKey: randomUUID(),
    status: "CREATED",
    providerRefundId: null,
    providerStatus: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    confirmedAt: null,
  };
}
