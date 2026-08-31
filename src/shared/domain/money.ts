import { ValidationError } from "./errors";

export type Money = Readonly<{
  amountInCents: bigint;
  currency: "ARS";
}>;

export function money(amountInCents: bigint): Money {
  if (amountInCents < 0n) {
    throw new ValidationError("El importe no puede ser negativo.");
  }

  return { amountInCents, currency: "ARS" };
}

export function effectivePrice(
  priceInCents: bigint,
  promotionalPriceInCents: bigint | null,
): bigint {
  money(priceInCents);

  if (promotionalPriceInCents === null) {
    return priceInCents;
  }

  money(promotionalPriceInCents);
  if (promotionalPriceInCents >= priceInCents) {
    throw new ValidationError(
      "El precio promocional debe ser menor que el precio regular.",
    );
  }

  return promotionalPriceInCents;
}

export function formatMoney(amountInCents: bigint): string {
  const value = money(amountInCents);
  const whole = value.amountInCents / 100n;
  const cents = (value.amountInCents % 100n).toString().padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(whole);

  return `$ ${formattedWhole},${cents}`;
}
