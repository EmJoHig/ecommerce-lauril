import type { PrismaClient } from "@/generated/prisma/client";
import type {
  InventoryMovementTransaction,
  InventoryUnitOfWork,
} from "../application/record-inventory-movement";

export class PrismaInventoryUnitOfWork implements InventoryUnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  run<T>(
    work: (transaction: InventoryMovementTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (prismaTransaction) => {
      const transaction: InventoryMovementTransaction = {
        findInventory: (id) =>
          prismaTransaction.inventory.findUnique({
            where: { id },
            select: {
              id: true,
              stockOnHand: true,
              stockReserved: true,
              version: true,
            },
          }),
        updateStock: async (input) => {
          const result = await prismaTransaction.inventory.updateMany({
            where: { id: input.id, version: input.expectedVersion },
            data: {
              stockOnHand: input.stockOnHand,
              version: { increment: 1 },
            },
          });
          return result.count === 1;
        },
        createMovement: (input) =>
          prismaTransaction.inventoryMovement.create({
            data: input,
            select: { id: true },
          }),
        createAudit: (input) =>
          prismaTransaction.auditLog.create({
            data: {
              actorUserId: input.actorUserId,
              action: "inventory.adjust",
              entityType: "Inventory",
              entityId: input.inventoryId,
              metadata: {
                movementId: input.movementId,
                quantity: input.quantity,
                stockBefore: input.stockBefore,
                stockAfter: input.stockAfter,
              },
            },
          }).then(() => undefined),
      };

      return work(transaction);
    });
  }
}
