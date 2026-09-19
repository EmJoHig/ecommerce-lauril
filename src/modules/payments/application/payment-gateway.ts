import type { PaymentProvider } from "../domain/payment";

export type CreateExternalCheckoutInput = Readonly<{
  idempotencyKey: string;
  orderId: string;
  orderNumber: bigint;
  attemptNumber: number;
  amountInCents: bigint;
  currency: string;
  payerEmail: string;
}>;

export type ExternalPaymentState = Readonly<{
  provider: PaymentProvider;
  providerResourceId: string;
  providerStatus: string;
  providerStatusDetail: string | null;
  externalReference: string | null;
  currency: string;
  totalAmountInCents: bigint | null;
  totalPaidAmountInCents: bigint | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  refundedAmountInCents: bigint | null;
  paymentTransactionId: string | null;
}>;

export type ExternalCheckout = ExternalPaymentState & Readonly<{
  checkoutUrl: string;
}>;

export type RefundOrderInput = Readonly<{
  providerResourceId: string;
  idempotencyKey: string;
  kind: "FULL" | "PARTIAL";
  amountInCents: bigint;
  paymentTransactionId: string | null;
}>;

export type ExternalRefundResult = Readonly<{
  providerRefundId: string | null;
  providerStatus: string | null;
}>;

export interface PaymentGateway {
  createCheckout(input: CreateExternalCheckoutInput): Promise<ExternalCheckout>;
  getPaymentState(providerResourceId: string): Promise<ExternalPaymentState>;
  refundOrder(input: RefundOrderInput): Promise<ExternalRefundResult>;
}
