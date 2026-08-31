import { describe, expect, it } from "vitest";
import { effectivePrice, formatMoney, money } from "@/shared/domain/money";
import { ValidationError } from "@/shared/domain/errors";

describe("money", () => {
  it("mantiene los cálculos en centavos enteros", () => {
    expect(money(123456n)).toEqual({ amountInCents: 123456n, currency: "ARS" });
    expect(formatMoney(123456n)).toBe("$ 1.234,56");
  });

  it("selecciona una promoción válida", () => {
    expect(effectivePrice(10000n, 8500n)).toBe(8500n);
    expect(effectivePrice(10000n, null)).toBe(10000n);
  });

  it("rechaza importes y promociones inválidos", () => {
    expect(() => money(-1n)).toThrow(ValidationError);
    expect(() => effectivePrice(10000n, 10000n)).toThrow(ValidationError);
  });
});
