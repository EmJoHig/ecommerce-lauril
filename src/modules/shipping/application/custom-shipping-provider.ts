import { quoteShippingMethod } from "../domain/shipping";
import type { ShippingMethodReader, ShippingProvider } from "./shipping-provider";

export class CustomShippingProvider implements ShippingProvider {
  constructor(private readonly reader: ShippingMethodReader) {}

  async quoteAll(itemsSubtotalInCents: bigint) {
    const methods = await this.reader.listActive();
    return methods.flatMap((method) => {
      const quote = quoteShippingMethod(method, itemsSubtotalInCents);
      return quote ? [quote] : [];
    });
  }

  async quote(methodId: string, itemsSubtotalInCents: bigint) {
    const method = await this.reader.findActiveById(methodId);
    return method ? quoteShippingMethod(method, itemsSubtotalInCents) : null;
  }
}
