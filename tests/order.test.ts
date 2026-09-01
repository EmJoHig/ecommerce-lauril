import { describe, expect, it } from "vitest";
import { calculateOrderLine, calculateOrderTotals, normalizeBuyerSnapshot, parseOrderNumber } from "@/modules/orders/domain/order";
import { calculateReservation, calculateReservationRelease } from "@/modules/inventory/domain/inventory";
import { ValidationError } from "@/shared/domain/errors";

describe("pedido y reserva", () => {
  it("calcula subtotal, envío y total sin floating point", () => {
    const line = calculateOrderLine(410001n, 3);
    expect(line).toBe(1230003n);
    expect(calculateOrderTotals({ lineSubtotalsInCents: [line, 9999n], shippingAmountInCents: 450000n })).toEqual({
      itemsSubtotalInCents: 1240002n, shippingAmountInCents: 450000n, discountAmountInCents: 0n, totalInCents: 1690002n,
    });
  });

  it("normaliza el snapshot del comprador", () => {
    expect(normalizeBuyerSnapshot({ firstName: " Ana  María ", lastName: " Pérez ", email: " ANA@MAIL.COM ", phone: "+54 11 5555-0000" })).toEqual({ firstName: "Ana María", lastName: "Pérez", email: "ana@mail.com", phone: "+54 11 5555-0000" });
  });

  it("valida el número público", () => {
    expect(parseOrderNumber("10001")).toBe(10001n);
    expect(() => parseOrderNumber("1 OR 1=1")).toThrow(ValidationError);
  });

  it("reserva sin modificar stock físico", () => {
    const onHand = 10;
    expect(calculateReservation(onHand, 2, 3)).toBe(5);
    expect(onHand).toBe(10);
  });

  it("impide overselling y libera exactamente la reserva", () => {
    expect(() => calculateReservation(10, 8, 3)).toThrow(ValidationError);
    expect(calculateReservationRelease(10, 8, 3)).toBe(5);
    expect(() => calculateReservationRelease(10, 2, 3)).toThrow(ValidationError);
  });
});
