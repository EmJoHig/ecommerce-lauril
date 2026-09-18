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
  currency: string;
  totalAmountInCents: bigint | null;
  totalPaidAmountInCents: bigint | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  refundedAmountInCents: bigint;
}>;

export type ExternalCheckout = ExternalPaymentState & Readonly<{
  checkoutUrl: string;
}>;

export interface PaymentGateway {
  createCheckout(input: CreateExternalCheckoutInput): Promise<ExternalCheckout>;
  getPaymentState(providerResourceId: string): Promise<ExternalPaymentState>;
}
