"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { DomainError } from "@/shared/domain/errors";
import { getWithdrawalAdminService } from "../infrastructure/withdrawal-admin-composition";

export async function manageWithdrawal(_: { message: string; success: boolean }, data: FormData) {
  await requireAdmin("admin.access");
  const actor = await requireAdmin("withdrawals.write");
  await requireAdmin("withdrawals.read");
  try {
    await getWithdrawalAdminService().change({ id: String(data.get("id") ?? ""), version: Number(data.get("version")), to: String(data.get("status") ?? ""), content: String(data.get("content") ?? ""), actorUserId: actor.id });
    revalidatePath("/admin/arrepentimientos");
    revalidatePath(`/admin/arrepentimientos/${String(data.get("id"))}`);
    return { message: "Actuación registrada.", success: true };
  } catch (error) { return { message: error instanceof DomainError ? error.message : "No se pudo guardar. Recargá la solicitud e intentá nuevamente.", success: false }; }
}
