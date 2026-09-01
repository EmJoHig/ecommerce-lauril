import { getPrisma } from "@/shared/infrastructure/prisma";
import { RecordInventoryMovement } from "../application/record-inventory-movement";
import { PrismaInventoryUnitOfWork } from "./prisma-inventory-unit-of-work";

export function getInventoryMovementRecorder(): RecordInventoryMovement {
  return new RecordInventoryMovement(
    new PrismaInventoryUnitOfWork(getPrisma()),
  );
}
