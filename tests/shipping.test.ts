import { describe, expect, it } from "vitest";
import { quoteShippingMethod, validateShippingMethodDraft, type ShippingMethodState } from "@/modules/shipping/domain/shipping";
import { ValidationError } from "@/shared/domain/errors";

const method: ShippingMethodState = {
  id: "10000000-0000-4000-8000-000000000001", code: "ENVIO_FIJO", name: "Envío fijo",
  description: null, type: "FLAT_RATE", costInCents: 450000n, requiresAddress: true,
  minimumSubtotalInCents: null, freeShippingFromInCents: 8000000n, isActive: true, sortOrder: 1,
};

describe("métodos de entrega", () => {
  it("cotiza una tarifa fija en centavos exactos", () => {
    expect(quoteShippingMethod(method, 1000000n)?.amountInCents).toBe(450000n);
  });

  it("aplica envío gratis al alcanzar el umbral", () => {
    expect(quoteShippingMethod(method, 8000000n)?.amountInCents).toBe(0n);
  });

  it("no ofrece métodos inactivos ni por debajo de su mínimo", () => {
    expect(quoteShippingMethod({ ...method, isActive: false }, 9000000n)).toBeNull();
    expect(quoteShippingMethod({ ...method, minimumSubtotalInCents: 2000000n }, 1999999n)).toBeNull();
  });

  it("retiro en local no requiere dirección", () => {
    const quote = quoteShippingMethod({ ...method, type: "PICKUP", requiresAddress: false, costInCents: 0n }, 1n);
    expect(quote).toMatchObject({ type: "PICKUP", requiresAddress: false, amountInCents: 0n });
  });

  it("rechaza políticas de dirección inconsistentes", () => {
    expect(() => validateShippingMethodDraft({ ...method, type: "PICKUP", requiresAddress: true })).toThrow(ValidationError);
    expect(() => validateShippingMethodDraft({ ...method, type: "LOCAL_DELIVERY", requiresAddress: false })).toThrow(ValidationError);
  });
});
