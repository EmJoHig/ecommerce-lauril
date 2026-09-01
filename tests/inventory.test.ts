import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "@/shared/domain/errors";
import {
  calculateAvailableStock,
  calculateStockTransition,
  isLowStock,
} from "@/modules/inventory/domain/inventory";
import {
  RecordInventoryMovement,
  type InventoryMovementTransaction,
  type InventoryUnitOfWork,
} from "@/modules/inventory/application/record-inventory-movement";

const actorId = "7bcaa109-9007-4f1c-bf56-bc4eaaf05647";

describe("inventory domain", () => {
  it("calcula disponibilidad y stock bajo descontando reservas", () => {
    expect(calculateAvailableStock(10, 4)).toBe(6);
    expect(isLowStock(10, 4, 6)).toBe(true);
    expect(isLowStock(10, 3, 6)).toBe(false);
  });

  it("calcula una venta sin perder trazabilidad del antes y después", () => {
    expect(
      calculateStockTransition({
        stockOnHand: 10,
        stockReserved: 2,
        quantity: -3,
        type: "SALE",
      }),
    ).toEqual({ stockBefore: 10, stockAfter: 7, availableAfter: 5 });
  });

  it("evita stock negativo o por debajo de las reservas", () => {
    expect(() =>
      calculateStockTransition({
        stockOnHand: 2,
        stockReserved: 0,
        quantity: -3,
        type: "SALE",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      calculateStockTransition({
        stockOnHand: 5,
        stockReserved: 4,
        quantity: -2,
        type: "CORRECTION",
      }),
    ).toThrow(ValidationError);
  });

  it("registra actualización y movimiento en una misma unidad de trabajo", async () => {
    const calls: string[] = [];
    const transaction: InventoryMovementTransaction = {
      findInventory: async () => ({ id: "2eac35c6-aec6-4d75-a6e0-f59e748318a6", stockOnHand: 2, stockReserved: 0, version: 4 }),
      updateStock: async () => { calls.push("update"); return true; },
      createMovement: async () => { calls.push("movement"); return { id: "movement-1" }; },
      createAudit: async () => { calls.push("audit"); },
    };
    const unitOfWork: InventoryUnitOfWork = { run: (work) => work(transaction) };
    const result = await new RecordInventoryMovement(unitOfWork).execute({
      inventoryId: "2eac35c6-aec6-4d75-a6e0-f59e748318a6",
      type: "RECEIPT",
      quantity: 3,
      reason: "Ingreso de proveedor",
    });
    expect(result).toEqual({ movementId: "movement-1" });
    expect(calls).toEqual(["update", "movement"]);
  });

  it("falla ante una actualización concurrente", async () => {
    const transaction: InventoryMovementTransaction = {
      findInventory: async () => ({ id: "2eac35c6-aec6-4d75-a6e0-f59e748318a6", stockOnHand: 2, stockReserved: 0, version: 4 }),
      updateStock: async () => false,
      createMovement: async () => ({ id: "unreachable" }),
      createAudit: async () => undefined,
    };
    const unitOfWork: InventoryUnitOfWork = { run: (work) => work(transaction) };
    await expect(
      new RecordInventoryMovement(unitOfWork).execute({
        inventoryId: "2eac35c6-aec6-4d75-a6e0-f59e748318a6",
        type: "RECEIPT",
        quantity: 1,
        reason: "Ingreso de proveedor",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("audita un ajuste manual junto con el movimiento", async () => {
    const calls: string[] = [];
    const transaction: InventoryMovementTransaction = {
      findInventory: async () => ({ id: "2eac35c6-aec6-4d75-a6e0-f59e748318a6", stockOnHand: 10, stockReserved: 2, version: 1 }),
      updateStock: async () => { calls.push("update"); return true; },
      createMovement: async () => { calls.push("movement"); return { id: "movement-manual" }; },
      createAudit: async (input) => { calls.push(`audit:${input.stockBefore}:${input.stockAfter}`); },
    };
    await new RecordInventoryMovement({ run: (work) => work(transaction) }).execute({
      inventoryId: "2eac35c6-aec6-4d75-a6e0-f59e748318a6",
      type: "ADJUSTMENT",
      quantity: -3,
      reason: "Conteo físico",
      adminUserId: actorId,
    });
    expect(calls).toEqual(["update", "movement", "audit:10:7"]);
  });
});
