import type { PaymentRefund, PaymentRefundStatus } from "../domain/payment-refund";

export interface PaymentRefundRepository {
  acquireActive(refund: PaymentRefund): Promise<PaymentRefund>;
  findActiveByAttemptId(paymentAttemptId: string): Promise<PaymentRefund | null>;
  updateStatus(input: Readonly<{
    id: string;
    status: PaymentRefundStatus;
    providerRefundId?: string | null;
    providerStatus?: string | null;
    failureCode?: string | null;
    submittedAt?: Date | null;
    confirmedAt?: Date | null;
  }>): Promise<PaymentRefund>;
}
