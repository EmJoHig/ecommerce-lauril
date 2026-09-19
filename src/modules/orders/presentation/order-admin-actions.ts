"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { DomainError } from "@/shared/domain/errors";
import { getOrderAdminService } from "../infrastructure/order-composition";
import type { OrderAdminActionState } from "./order-admin-action-state";
import { getRequestPaymentRefund } from "@/modules/payments/infrastructure/payment-composition";
import { parseMoneyInputToCents } from "@/shared/domain/money";

const transitionSchema = z.object({
  orderId: z.uuid(),
  toStatus: z.enum(["CANCELLED", "PREPARING", "READY_TO_SHIP", "SHIPPED", "DELIVERED"]),
  reason: z.string().trim().max(500).optional().default(""),
});

const noteSchema = z.object({
  orderId: z.uuid(),
  content: z.string().trim().min(1).max(2000),
});

const refundSchema = z.object({
  orderId: z.uuid(),
  kind: z.enum(["FULL", "PARTIAL"]),
  amount: z.string().trim().max(50).optional().default(""),
});

export async function transitionOrderAction(
  _previous: OrderAdminActionState,
  formData: FormData,
): Promise<OrderAdminActionState> {
  const admin = await requireAdmin("orders.write");
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revisá el estado y el motivo." };
  try {
    const result = await getOrderAdminService().transition({
      orderId: parsed.data.orderId,
      toStatus: parsed.data.toStatus,
      actorUserId: admin.id,
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    });
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/${parsed.data.orderId}`);
    return {
      status: "success",
      message: result.changed ? "Estado actualizado correctamente." : "El pedido ya tenía ese estado.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof DomainError ? error.message : "No se pudo actualizar el pedido.",
    };
  }
}

export async function addOrderNoteAction(
  _previous: OrderAdminActionState,
  formData: FormData,
): Promise<OrderAdminActionState> {
  const admin = await requireAdmin("orders.write");
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "La nota es obligatoria y admite hasta 2000 caracteres." };
  try {
    await getOrderAdminService().addNote({
      orderId: parsed.data.orderId,
      actorUserId: admin.id,
      content: parsed.data.content,
    });
    revalidatePath(`/admin/pedidos/${parsed.data.orderId}`);
    return { status: "success", message: "Nota interna agregada." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof DomainError ? error.message : "No se pudo agregar la nota.",
    };
  }
}

export async function requestPaymentRefundAction(
  _previous: OrderAdminActionState,
  formData: FormData,
): Promise<OrderAdminActionState> {
  const admin = await requireAdmin("orders.write");
  const parsed = refundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revisá los datos del reembolso." };
  try {
    const amountInCents = parsed.data.kind === "PARTIAL"
      ? parseMoneyInputToCents(parsed.data.amount)
      : null;
    await getRequestPaymentRefund().execute({
      orderId: parsed.data.orderId,
      actorUserId: admin.id,
      amountInCents,
    });
    revalidatePath(`/admin/pedidos/${parsed.data.orderId}`);
    return { status: "success", message: "Solicitud de reembolso enviada. Esperando confirmación de Mercado Pago." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof DomainError ? error.message : "No se pudo solicitar el reembolso.",
    };
  }
}
