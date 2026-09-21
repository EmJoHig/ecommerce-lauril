import type { PaymentAttempt, PaymentEvent, PaymentAttemptStatus } from "../domain/payment";
import type { OrderStatusValue } from "@/modules/orders/domain/order";
import type { PaymentRefund, PaymentRefundStatus } from "../domain/payment-refund";

export type PaymentConfirmationOrder = Readonly<{
  id: string;
  number: bigint;
  status: OrderStatusValue;
  currency: string;
  totalInCents: bigint;
  reservationReleasedAt: Date | null;
  items: ReadonlyArray<Readonly<{
    quantity: number;
    inventory: Readonly<{
      id: string;
      stockOnHand: number;
      stockReserved: number;
      version: number;
    }> | null;
  }>>;
}>;

export interface PaymentConfirmationTransaction {
  findEvent(id: string): Promise<PaymentEvent | null>;
  findAttempt(id: string): Promise<PaymentAttempt | null>;
  findOrder(id: string): Promise<PaymentConfirmationOrder | null>;
  findActiveRefund(paymentAttemptId: string): Promise<PaymentRefund | null>;
  findLateRefundInReview(input: {
    paymentAttemptId: string;
    providerResourceId: string;
    amountInCents: bigint;
  }): Promise<PaymentRefund | null>;
  createRefund(refund: PaymentRefund): Promise<void>;
  updateRefund(input: Readonly<{
    id: string;
    status: PaymentRefundStatus;
    providerRefundId?: string | null;
    providerStatus?: string | null;
    failureCode?: string | null;
    submittedAt?: Date | null;
    confirmedAt?: Date | null;
  }>): Promise<void>;
  updateAttempt(input: Readonly<{
    id: string;
    status: PaymentAttemptStatus;
    providerStatus: string;
    providerStatusDetail: string | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    refundedAmountInCents: bigint;
  }>): Promise<void>;
  convertInventory(input: Readonly<{
    id: string;
    expectedVersion: number;
    stockOnHand: number;
    stockReserved: number;
  }>): Promise<boolean>;
  createSaleMovement(input: Readonly<{
    inventoryId: string;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    orderId: string;
    createdAt: Date;
  }>): Promise<void>;
  markOrderPaid(orderId: string, changedAt: Date): Promise<boolean>;
  createPaidHistory(orderId: string, changedAt: Date): Promise<void>;
  transitionOrderRefund(input: Readonly<{
    orderId: string;
    fromStatus: "PAID" | "PARTIALLY_REFUNDED";
    toStatus: "PARTIALLY_REFUNDED" | "REFUNDED";
    changedAt: Date;
    reason: string;
  }>): Promise<boolean>;
  finishEvent(eventId: string, attemptId: string, processedAt: Date): Promise<boolean>;
}

export interface PaymentConfirmationUnitOfWork {
  run<T>(work: (transaction: PaymentConfirmationTransaction) => Promise<T>): Promise<T>;
}
