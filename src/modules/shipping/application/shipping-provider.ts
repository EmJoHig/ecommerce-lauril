import type { ShippingMethodState, ShippingQuote } from "../domain/shipping";

export interface ShippingMethodReader {
  listActive(): Promise<ReadonlyArray<ShippingMethodState>>;
  findActiveById(id: string): Promise<ShippingMethodState | null>;
}

export interface ShippingProvider {
  quoteAll(itemsSubtotalInCents: bigint): Promise<ReadonlyArray<ShippingQuote>>;
  quote(methodId: string, itemsSubtotalInCents: bigint): Promise<ShippingQuote | null>;
}
