import { ValidationError } from "@/shared/domain/errors";

export const inventoryMovementTypes = [
  "RECEIPT",
  "SALE",
  "ADJUSTMENT",
  "RETURN",
  "CANCELLATION",
  "CORRECTION",
] as const;

export type InventoryMovementType = (typeof inventoryMovementTypes)[number];

export type StockTransitionInput = Readonly<{
  stockOnHand: number;
  stockReserved: number;
  quantity: number;
  type: InventoryMovementType;
}>;

export type StockTransition = Readonly<{
  stockBefore: number;
  stockAfter: number;
  availableAfter: number;
}>;

export function calculateAvailableStock(
  stockOnHand: number,
  stockReserved: number,
): number {
  assertStockValues(stockOnHand, stockReserved);
  return stockOnHand - stockReserved;
}

export function isLowStock(
  stockOnHand: number,
  stockReserved: number,
  minimumStock: number,
): boolean {
  assertInteger(minimumStock, "stock mínimo");
  if (minimumStock < 0) {
    throw new ValidationError("El stock mínimo no puede ser negativo.");
  }
  return calculateAvailableStock(stockOnHand, stockReserved) <= minimumStock;
}

export function calculateStockTransition(
  input: StockTransitionInput,
): StockTransition {
  assertInteger(input.quantity, "cantidad");

  assertStockValues(input.stockOnHand, input.stockReserved);
  if (input.quantity === 0) {
    throw new ValidationError("Un movimiento debe cambiar el stock.");
  }
  if (["RECEIPT", "RETURN", "CANCELLATION"].includes(input.type)) {
    if (input.quantity < 0) {
      throw new ValidationError(`${input.type} requiere una cantidad positiva.`);
    }
  }
  if (input.type === "SALE" && input.quantity > 0) {
    throw new ValidationError("SALE requiere una cantidad negativa.");
  }

  const stockAfter = input.stockOnHand + input.quantity;
  if (stockAfter < 0) {
    throw new ValidationError("El movimiento dejaría stock negativo.");
  }
  if (input.stockReserved > stockAfter) {
    throw new ValidationError(
      "El movimiento dejaría más stock reservado que stock físico.",
    );
  }

  return {
    stockBefore: input.stockOnHand,
    stockAfter,
    availableAfter: calculateAvailableStock(stockAfter, input.stockReserved),
  };
}

function assertStockValues(stockOnHand: number, stockReserved: number): void {
  assertInteger(stockOnHand, "stock actual");
  assertInteger(stockReserved, "stock reservado");
  if (stockOnHand < 0 || stockReserved < 0) {
    throw new ValidationError("El stock no puede ser negativo.");
  }
  if (stockReserved > stockOnHand) {
    throw new ValidationError(
      "El stock reservado no puede superar el stock físico.",
    );
  }
}

function assertInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError(`El ${field} debe ser un entero seguro.`);
  }
}
