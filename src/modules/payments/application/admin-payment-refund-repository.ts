import type { OrderStatusValue } from "@/modules/orders/domain/order";
import type { PaymentAttempt } from "../domain/payment";
import type { PaymentRefund } from "../domain/payment-refund";

export type RefundablePayment = Readonly<{
  orderId: string;
  orderNumber: bigint;
  orderStatus: OrderStatusValue;
  totalInCents: bigint;
  currency: string;
  attempt: PaymentAttempt;
}>;

export interface AdminPaymentRefundRepository {
  findRefundablePayment(orderId: string): Promise<RefundablePayment | null>;
  acquireWithAudit(refund: PaymentRefund, orderId: string, actorUserId: string): Promise<PaymentRefund>;
}
