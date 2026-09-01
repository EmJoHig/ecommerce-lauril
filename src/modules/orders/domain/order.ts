import { z } from "zod";
import { calculateLineSubtotal } from "@/modules/cart/domain/cart";
import { normalizeCustomerAddress, normalizeEmail, type CustomerAddressInput } from "@/modules/customers/domain/customer";
import { ValidationError } from "@/shared/domain/errors";
import { money } from "@/shared/domain/money";

export const orderStatuses = [
  "PENDING_PAYMENT", "PAID", "PREPARING", "READY_TO_SHIP", "SHIPPED",
  "DELIVERED", "CANCELLED", "PAYMENT_REJECTED", "REFUNDED", "PARTIALLY_REFUNDED",
] as const;
export type OrderStatusValue = (typeof orderStatuses)[number];

export type BuyerSnapshotInput = Readonly<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}>;

export function normalizeBuyerSnapshot(input: BuyerSnapshotInput) {
  const firstName = normalizeName(input.firstName, "El nombre");
  const lastName = normalizeName(input.lastName, "El apellido");
  const phone = input.phone.trim();
  if (phone.length < 6 || phone.length > 30 || !/^[+()0-9 .-]+$/.test(phone)) {
    throw new ValidationError("Ingresá un teléfono válido.");
  }
  return { firstName, lastName, email: normalizeEmail(input.email), phone };
}

export function normalizeOrderAddress(input: CustomerAddressInput) {
  return normalizeCustomerAddress(input);
}

export function calculateOrderLine(unitPriceInCents: bigint, quantity: number) {
  return calculateLineSubtotal(unitPriceInCents, quantity);
}

export function calculateOrderTotals(input: {
  lineSubtotalsInCents: ReadonlyArray<bigint>;
  shippingAmountInCents: bigint;
}) {
  money(input.shippingAmountInCents);
  const itemsSubtotalInCents = input.lineSubtotalsInCents.reduce((total, line) => {
    money(line);
    return total + line;
  }, 0n);
  const discountAmountInCents = 0n;
  const totalInCents = itemsSubtotalInCents + input.shippingAmountInCents - discountAmountInCents;
  return { itemsSubtotalInCents, shippingAmountInCents: input.shippingAmountInCents, discountAmountInCents, totalInCents };
}

export function parseOrderNumber(value: string): bigint {
  if (!/^\d{5,20}$/.test(value)) throw new ValidationError("El número de pedido no es válido.");
  return BigInt(value);
}

export function validateId(value: string): string {
  return z.uuid().parse(value);
}

function normalizeName(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 100) throw new ValidationError(`${label} es obligatorio.`);
  return normalized;
}
