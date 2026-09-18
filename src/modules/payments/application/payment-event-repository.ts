import type { PaymentEvent, PaymentEventProcessingStatus, PaymentProvider } from "../domain/payment";

export type PersistPaymentEventResult = Readonly<{
  event: PaymentEvent;
  created: boolean;
}>;

export interface PaymentEventRepository {
  persistIfAbsent(event: PaymentEvent): Promise<PersistPaymentEventResult>;
  findByProviderEventId(provider: PaymentProvider, providerEventId: string): Promise<PaymentEvent | null>;
  updateProcessingStatus(input: Readonly<{
    id: string;
    processingStatus: PaymentEventProcessingStatus;
    processedAt: Date | null;
  }>): Promise<PaymentEvent>;
}
