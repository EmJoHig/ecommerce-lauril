import { z } from "zod";
import { boundedPageSize, businessDate, normalizedSearch, positivePage } from "@/shared/application/admin-list-query";
import { ConflictError, NotFoundError } from "@/shared/domain/errors";
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
    const page = positivePage(input.page);
    const pageSize = boundedPageSize(input.pageSize);
    const status = orderStatuses.find((value) => value === input.status);
    const ownerType = (["customer", "guest"] as const).find((value) => value === input.ownerType);
    const sort = adminOrderSorts.find((value) => value === input.sort) ?? "newest";
    const search = normalizedSearch(input.search);
    const createdFrom = businessDate(input.createdFrom);
    const createdToExclusive = businessDate(input.createdTo, true);
    const query: AdminOrderListQuery = {
      page,
      pageSize,
      sort,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(ownerType ? { ownerType: ownerType as AdminOrderOwnerType } : {}),
      ...(input.shippingMethodId && z.uuid().safeParse(input.shippingMethodId).success
        ? { shippingMethodId: input.shippingMethodId }
        : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdToExclusive ? { createdToExclusive } : {}),
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
