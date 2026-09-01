"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { RecordInventoryMovement } from "../application/record-inventory-movement";
import { PrismaInventoryUnitOfWork } from "../infrastructure/prisma-inventory-unit-of-work";
import { getPrisma } from "@/shared/infrastructure/prisma";
import type { InventoryActionState } from "./inventory-action-state";

export async function adjustInventoryAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const user = await requireAdmin("inventory.write");
  const parsed = z.object({
    inventoryId: z.uuid(),
    quantity: z.coerce.number().int().safe().refine((value) => value !== 0, "La variación no puede ser cero."),
    reason: z.string().trim().min(3).max(500),
  }).safeParse({
    inventoryId: formData.get("inventoryId"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  try {
    await new RecordInventoryMovement(new PrismaInventoryUnitOfWork(getPrisma())).execute({
      inventoryId: parsed.data.inventoryId,
      type: "ADJUSTMENT",
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      referenceType: "manual_admin_adjustment",
      referenceId: crypto.randomUUID(),
      adminUserId: user.id,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/stock");
    revalidatePath("/productos");
    return { status: "success", message: "Ajuste registrado con movimiento y auditoría." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof DomainError ? error.message : "No se pudo ajustar el inventario.",
    };
  }
}
