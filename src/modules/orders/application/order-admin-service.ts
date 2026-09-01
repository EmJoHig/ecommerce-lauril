import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import {
  allowedAdministrativeTransitions,
  assertOrderTransition,
  normalizeOrderNote,
  normalizeOrderTransitionReason,
  orderStatuses,
  type OrderStatusValue,
} from "../domain/order";
import {
  adminOrderSorts,
  type AdminOrderListQuery,
  type AdminOrderOwnerType,
  type OrderAdminRepository,
} from "./order-admin-repository";

export class OrderAdminService {
  constructor(private readonly repository: OrderAdminRepository) {}

  list(input: Readonly<{
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    ownerType?: string;
    shippingMethodId?: string;
    createdFrom?: string;
    createdTo?: string;
    sort?: string;
  }>) {
    const page = safePositiveInteger(input.page, 1);
    const pageSize = Math.min(safePositiveInteger(input.pageSize, 20), 100);
    const status = orderStatuses.find((value) => value === input.status);
    const ownerType = (["customer", "guest"] as const).find((value) => value === input.ownerType);
    const sort = adminOrderSorts.find((value) => value === input.sort) ?? "newest";
    const query: AdminOrderListQuery = {
      page,
      pageSize,
      sort,
      ...(input.search?.trim() ? { search: input.search.trim().slice(0, 200) } : {}),
      ...(status ? { status } : {}),
      ...(ownerType ? { ownerType: ownerType as AdminOrderOwnerType } : {}),
      ...(input.shippingMethodId && z.uuid().safeParse(input.shippingMethodId).success
        ? { shippingMethodId: input.shippingMethodId }
        : {}),
      ...(input.createdFrom ? { createdFrom: parseBusinessDate(input.createdFrom, false) } : {}),
      ...(input.createdTo ? { createdToExclusive: parseBusinessDate(input.createdTo, true) } : {}),
    };
    return this.repository.list(query);
  }

  async find(id: string) {
    const order = await this.repository.find(z.uuid().parse(id));
    if (!order) throw new NotFoundError("No se encontró el pedido.");
    return {
      ...order,
      allowedTransitions: allowedAdministrativeTransitions(order.status, order.shippingMethodType),
    };
  }

  async transition(input: Readonly<{
    orderId: string;
    toStatus: OrderStatusValue;
    actorUserId: string;
    reason?: string;
  }>, now = new Date()) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.performTransition(input, now);
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === 2) throw error;
      }
    }
    throw new ConflictError("No se pudo actualizar el pedido después de varios intentos.");
  }

  private async performTransition(input: Readonly<{
    orderId: string;
    toStatus: OrderStatusValue;
    actorUserId: string;
    reason?: string;
  }>, now: Date) {
    const orderId = z.uuid().parse(input.orderId);
    const actorUserId = z.uuid().parse(input.actorUserId);
    const order = await this.repository.find(orderId);
    if (!order) throw new NotFoundError("No se encontró el pedido.");
    if (order.status === input.toStatus) return { changed: false, order };
    assertOrderTransition({
      from: order.status,
      to: input.toStatus,
      shippingMethodType: order.shippingMethodType,
      source: "ADMIN",
    });
    const reason = normalizeOrderTransitionReason(
      input.reason,
      defaultTransitionReason(input.toStatus),
    );
    const result = input.toStatus === "CANCELLED"
      ? await this.repository.cancelPending({ orderId, actorUserId, reason, changedAt: now })
      : await this.repository.transition({
          orderId,
          fromStatus: order.status,
          toStatus: input.toStatus,
          actorUserId,
          reason,
          changedAt: now,
        });
    if (!result.order) throw new NotFoundError("No se encontró el pedido.");
    return result;
  }

  async addNote(input: Readonly<{ orderId: string; actorUserId: string; content: string }>, now = new Date()) {
    const order = await this.repository.addNote({
      orderId: z.uuid().parse(input.orderId),
      actorUserId: z.uuid().parse(input.actorUserId),
      content: normalizeOrderNote(input.content),
      createdAt: now,
    });
    if (!order) throw new NotFoundError("No se encontró el pedido.");
    return order;
  }
}

function safePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function parseBusinessDate(value: string, endExclusive: boolean): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("La fecha no es válida.");
  }
  const date = new Date(`${value}T00:00:00-03:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError("La fecha no es válida.");
  }
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function defaultTransitionReason(status: OrderStatusValue): string {
  const reasons: Partial<Record<OrderStatusValue, string>> = {
    PREPARING: "El pedido comenzó a prepararse.",
    READY_TO_SHIP: "El pedido quedó listo para entregar o despachar.",
    SHIPPED: "El pedido fue despachado.",
    DELIVERED: "El pedido fue entregado.",
    CANCELLED: "Pedido cancelado por administración.",
  };
  return reasons[status] ?? "Estado actualizado por administración.";
}
