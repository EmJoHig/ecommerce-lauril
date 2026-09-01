import { calculateAvailableStock } from "@/modules/inventory/domain/inventory";
import { ValidationError } from "@/shared/domain/errors";
import { effectivePrice, money } from "@/shared/domain/money";

export const MAX_CART_ITEM_QUANTITY = 999;

export type CartLineAvailability =
  | "AVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK";

export type CartVariantState = Readonly<{
  productStatus: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  variantActive: boolean;
  priceInCents: bigint;
  promotionalPriceInCents: bigint | null;
  stockOnHand: number;
  stockReserved: number;
}>;

export function validateCartQuantity(quantity: number): number {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CART_ITEM_QUANTITY
  ) {
    throw new ValidationError(
      `La cantidad debe ser un entero entre 1 y ${MAX_CART_ITEM_QUANTITY}.`,
    );
  }
  return quantity;
}

export function calculateLineSubtotal(
  unitPriceInCents: bigint,
  quantity: number,
): bigint {
  money(unitPriceInCents);
  validateCartQuantity(quantity);
  return unitPriceInCents * BigInt(quantity);
}

export function calculateCartSubtotal(
  lineSubtotalsInCents: ReadonlyArray<bigint>,
): bigint {
  return lineSubtotalsInCents.reduce((total, subtotal) => {
    money(subtotal);
    return total + subtotal;
  }, 0n);
}

export function calculateCartItemCount(
  quantities: ReadonlyArray<number>,
): number {
  const count = quantities.reduce(
    (total, quantity) => total + validateCartQuantity(quantity),
    0,
  );
  if (!Number.isSafeInteger(count)) {
    throw new ValidationError("La cantidad total del carrito es inválida.");
  }
  return count;
}

export function currentCartUnitPrice(state: CartVariantState): bigint {
  return effectivePrice(
    state.priceInCents,
    state.promotionalPriceInCents,
  );
}

export function getCartLineAvailability(
  state: CartVariantState,
  quantity: number,
): Readonly<{ status: CartLineAvailability; availableStock: number }> {
  validateCartQuantity(quantity);
  const availableStock = calculateAvailableStock(
    state.stockOnHand,
    state.stockReserved,
  );
  if (state.productStatus !== "ACTIVE") {
    return { status: "PRODUCT_UNAVAILABLE", availableStock };
  }
  if (!state.variantActive) {
    return { status: "VARIANT_UNAVAILABLE", availableStock };
  }
  if (availableStock === 0) {
    return { status: "OUT_OF_STOCK", availableStock };
  }
  if (quantity > availableStock) {
    return { status: "INSUFFICIENT_STOCK", availableStock };
  }
  return { status: "AVAILABLE", availableStock };
}

export function assertCartLineCanBeSet(
  state: CartVariantState,
  quantity: number,
): void {
  const availability = getCartLineAvailability(state, quantity);
  if (availability.status === "PRODUCT_UNAVAILABLE") {
    throw new ValidationError("El producto ya no está disponible.");
  }
  if (availability.status === "VARIANT_UNAVAILABLE") {
    throw new ValidationError("La variante ya no está disponible.");
  }
  if (availability.status === "OUT_OF_STOCK") {
    throw new ValidationError("La variante no tiene stock disponible.");
  }
  if (availability.status === "INSUFFICIENT_STOCK") {
    throw new ValidationError(
      `Solo hay ${availability.availableStock} unidades disponibles.`,
    );
  }
}

export function cartAvailabilityMessage(
  status: CartLineAvailability,
  availableStock: number,
): string | null {
  if (status === "PRODUCT_UNAVAILABLE") return "El producto dejó de estar publicado.";
  if (status === "VARIANT_UNAVAILABLE") return "La variante dejó de estar disponible.";
  if (status === "OUT_OF_STOCK") return "La variante se quedó sin stock.";
  if (status === "INSUFFICIENT_STOCK") {
    return `Actualizá la cantidad: quedan ${availableStock} unidades.`;
  }
  return null;
}
