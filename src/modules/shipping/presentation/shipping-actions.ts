"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { DomainError } from "@/shared/domain/errors";
import { getShippingAdminService } from "../infrastructure/shipping-composition";
import type { ShippingActionState } from "./shipping-action-state";

const saveSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  type: z.enum(["PICKUP", "FLAT_RATE", "LOCAL_DELIVERY", "TO_COORDINATE"]),
  cost: z.string().trim().min(1),
  requiresAddress: z.string().optional(),
  minimumSubtotal: z.string().trim().optional().default(""),
  freeShippingFrom: z.string().trim().optional().default(""),
  isActive: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

export async function saveShippingMethodAction(
  _previous: ShippingActionState,
  formData: FormData,
): Promise<ShippingActionState> {
  const admin = await requireAdmin("shipping.write");
  const parsed = saveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revisá los datos del método de entrega." };
  let id: string;
  try {
    const { id: rawId, ...raw } = parsed.data;
    const input = { ...raw, requiresAddress: raw.requiresAddress === "on", isActive: raw.isActive === "on" };
    id = rawId
      ? (await getShippingAdminService().update(rawId, input, admin.id)).id
      : (await getShippingAdminService().create(input, admin.id)).id;
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudo guardar el método de entrega." };
  }
  revalidatePath("/admin/envios");
  revalidatePath("/checkout");
  redirect(`/admin/envios/${id}/editar?guardado=1`);
}

export async function setShippingMethodActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin("shipping.write");
  const input = z.object({ id: z.uuid(), active: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  await getShippingAdminService().setActive(input.id, input.active === "true", admin.id);
  revalidatePath("/admin/envios");
  revalidatePath("/checkout");
}
