"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { DomainError } from "@/shared/domain/errors";
import type { AdminActionState } from "@/shared/presentation/admin-action-state";
import { getCustomerAdminService } from "../infrastructure/customer-admin-composition";

export async function updateCustomerAdminAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin("customers.write");
  const parsed = z.object({
    customerId: z.uuid(), firstName: z.string(), lastName: z.string(), phone: z.string(), document: z.string().optional().default(""),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revisá los datos del cliente." };
  try {
    await getCustomerAdminService().updateProfile({ ...parsed.data, actorUserId: admin.id });
    revalidatePath("/admin/clientes"); revalidatePath(`/admin/clientes/${parsed.data.customerId}`);
    return { status: "success", message: "Datos actualizados." };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudo actualizar el cliente." };
  }
}

export async function setCustomerStatusAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin("customers.write");
  const parsed = z.object({ customerId: z.uuid(), status: z.enum(["ACTIVE", "DISABLED"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "El estado no es válido." };
  try {
    await getCustomerAdminService().setStatus({ ...parsed.data, actorUserId: admin.id });
    revalidatePath("/admin/clientes"); revalidatePath(`/admin/clientes/${parsed.data.customerId}`);
    return { status: "success", message: parsed.data.status === "ACTIVE" ? "Cliente habilitado." : "Cliente deshabilitado." };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudo cambiar el estado." };
  }
}

export async function addCustomerNoteAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin("customers.write");
  const parsed = z.object({ customerId: z.uuid(), content: z.string().trim().min(1).max(2000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "La nota es obligatoria y admite hasta 2000 caracteres." };
  try {
    await getCustomerAdminService().addNote({ ...parsed.data, actorUserId: admin.id });
    revalidatePath(`/admin/clientes/${parsed.data.customerId}`);
    return { status: "success", message: "Nota interna agregada." };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudo agregar la nota." };
  }
}
