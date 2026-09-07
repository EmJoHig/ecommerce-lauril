"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import type { AdminActionState } from "@/shared/presentation/admin-action-state";
import { getAdminAccessService } from "../infrastructure/admin-access-composition";
import { requireAdmin } from "./session";

export async function createAdminAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actor = await requireAdmin("users.write");
  const parsed = z.object({ email: z.string(), password: z.string(), firstName: z.string(), lastName: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revisá los datos del administrador." };
  try {
    await getAdminAccessService().create({ ...parsed.data, roleIds: formData.getAll("roleIds").map(String), actorUserId: actor.id });
    revalidatePath("/admin/administradores"); revalidatePath("/admin/roles");
    return { status: "success", message: "Administrador creado." };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudo crear el administrador." };
  }
}

export async function setAdminStatusAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actor = await requireAdmin("users.write");
  const parsed = z.object({ userId: z.uuid(), status: z.enum(["ACTIVE", "DISABLED"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "El estado no es válido." };
  try {
    await getAdminAccessService().setStatus({ ...parsed.data, actorUserId: actor.id });
    revalidatePath("/admin/administradores"); revalidatePath("/admin/roles");
    return { status: "success", message: parsed.data.status === "ACTIVE" ? "Administrador activado." : "Administrador deshabilitado." };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudo cambiar el estado." };
  }
}

export async function updateAdminRolesAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const actor = await requireAdmin("users.write");
  const parsed = z.object({ userId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "El administrador no es válido." };
  try {
    await getAdminAccessService().updateRoles({ userId: parsed.data.userId, roleIds: formData.getAll("roleIds").map(String), actorUserId: actor.id });
    revalidatePath("/admin/administradores"); revalidatePath("/admin/roles");
    return { status: "success", message: "Roles actualizados." };
  } catch (error) {
    return { status: "error", message: error instanceof DomainError ? error.message : "No se pudieron actualizar los roles." };
  }
}
