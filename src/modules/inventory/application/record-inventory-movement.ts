import { z } from "zod";
import { ConflictError, NotFoundError } from "@/shared/domain/errors";
import type { InventoryMovementType } from "../domain/inventory";
import { calculateStockTransition } from "../domain/inventory";

export const recordInventoryMovementSchema = z.object({
  inventoryId: z.uuid(),
  type: z.enum([
    "RECEIPT",
    "SALE",
    "ADJUSTMENT",
    "RETURN",
    "CANCELLATION",
    "CORRECTION",
  ]),
  quantity: z.number().int().safe(),
  reason: z.string().trim().min(3).max(500),
  referenceType: z.string().trim().min(1).max(80).nullable().default(null),
  referenceId: z.string().trim().min(1).max(120).nullable().default(null),
  adminUserId: z.uuid().nullable().default(null),
});

export type RecordInventoryMovementInput = z.input<
  typeof recordInventoryMovementSchema
>;

export type InventorySnapshot = Readonly<{
  id: string;
  stockOnHand: number;
  stockReserved: number;
  version: number;
}>;

export interface InventoryMovementTransaction {
  findInventory(id: string): Promise<InventorySnapshot | null>;
  updateStock(input: {
    id: string;
    expectedVersion: number;
    stockOnHand: number;
  }): Promise<boolean>;
  createMovement(input: {
    inventoryId: string;
    type: InventoryMovementType;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
    reason: string;
    referenceType: string | null;
    referenceId: string | null;
    adminUserId: string | null;
  }): Promise<{ id: string }>;
  createAudit(input: {
    actorUserId: string;
    inventoryId: string;
    movementId: string;
    quantity: number;
    stockBefore: number;
    stockAfter: number;
  }): Promise<void>;
}

export interface InventoryUnitOfWork {
  run<T>(work: (transaction: InventoryMovementTransaction) => Promise<T>): Promise<T>;
}

export class RecordInventoryMovement {
  constructor(private readonly unitOfWork: InventoryUnitOfWork) {}

  execute(rawInput: RecordInventoryMovementInput): Promise<{ movementId: string }> {
    const input = recordInventoryMovementSchema.parse(rawInput);

    return this.unitOfWork.run(async (transaction) => {
      const inventory = await transaction.findInventory(input.inventoryId);
      if (!inventory) {
        throw new NotFoundError("No se encontró el inventario.");
      }

      const transition = calculateStockTransition({
        stockOnHand: inventory.stockOnHand,
        stockReserved: inventory.stockReserved,
        quantity: input.quantity,
        type: input.type,
      });

      const updated = await transaction.updateStock({
        id: inventory.id,
        expectedVersion: inventory.version,
        stockOnHand: transition.stockAfter,
      });
      if (!updated) {
        throw new ConflictError(
          "El inventario cambió durante la operación; reintente con datos actuales.",
        );
      }

      const movement = await transaction.createMovement({
        inventoryId: inventory.id,
        type: input.type,
        quantity: input.quantity,
        stockBefore: transition.stockBefore,
        stockAfter: transition.stockAfter,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        adminUserId: input.adminUserId,
      });

      if (input.adminUserId) {
        await transaction.createAudit({
          actorUserId: input.adminUserId,
          inventoryId: inventory.id,
          movementId: movement.id,
          quantity: input.quantity,
          stockBefore: transition.stockBefore,
          stockAfter: transition.stockAfter,
        });
      }

      return { movementId: movement.id };
    });
  }
}
