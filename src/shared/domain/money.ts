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

export function parseMoneyInputToCents(value: string): bigint {
  const normalized = value.trim().replace(/\s/g, "");
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) {
    throw new ValidationError(
      "El importe debe ser un número positivo con hasta dos decimales.",
    );
  }

  const [whole = "0", fraction = ""] = normalized.split(/[.,]/);
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  money(amount);
  return amount;
}

export function formatMoneyInput(amountInCents: bigint): string {
  const value = money(amountInCents).amountInCents;
  const whole = value / 100n;
  const cents = value % 100n;
  return cents === 0n
    ? whole.toString()
    : `${whole},${cents.toString().padStart(2, "0")}`;
}

export function moneyToDecimalString(amountInCents: bigint): string {
  const value = money(amountInCents).amountInCents;
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
