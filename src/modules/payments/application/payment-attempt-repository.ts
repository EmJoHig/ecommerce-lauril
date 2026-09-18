import type { PaymentAttempt, PaymentAttemptStatus, PaymentProvider } from "../domain/payment";

export type UpdatePaymentAttemptSnapshot = Readonly<{
  id: string;
  status: PaymentAttemptStatus;
  providerResourceId: string | null;
  checkoutUrl: string | null;
  providerStatus: string | null;
  providerStatusDetail: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  refundedAmountInCents: bigint;
}>;

export type AcquirePaymentAttemptInput = Readonly<{
  orderId: string;
  provider: PaymentProvider;
  amountInCents: bigint;
  currency: string;
  createdAt: Date;
}>;

export interface PaymentAttemptRepository {
  create(attempt: PaymentAttempt): Promise<PaymentAttempt>;
  acquireActive(input: AcquirePaymentAttemptInput): Promise<PaymentAttempt>;
  findById(id: string): Promise<PaymentAttempt | null>;
  findByProviderResourceId(provider: PaymentProvider, providerResourceId: string): Promise<PaymentAttempt | null>;
  listByOrderId(orderId: string): Promise<ReadonlyArray<PaymentAttempt>>;
  updateSnapshot(input: UpdatePaymentAttemptSnapshot): Promise<PaymentAttempt>;
}
