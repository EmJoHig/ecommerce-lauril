import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateReservationRelease } from "@/modules/inventory/domain/inventory";
import { ConflictError } from "@/shared/domain/errors";
import type {
  AdminOrderCancellationCommand,
  AdminOrderDetail,
  AdminOrderListQuery,
  AdminOrderMutationResult,
  AdminOrderPage,
  AdminOrderSort,
  AdminOrderTransitionCommand,
  OrderAdminRepository,
} from "../application/order-admin-repository";

const adminDetailInclude = {
  items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  statusHistory: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
  },
  notes: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
  },
} satisfies Prisma.OrderInclude;

type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof adminDetailInclude }>;
type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PrismaOrderAdminRepository implements OrderAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: AdminOrderListQuery): Promise<AdminOrderPage> {
    const where = adminOrderWhere(query);
    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.order.findMany({
        where,
        orderBy: adminOrderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          number: true,
          buyerFirstName: true,
          buyerLastName: true,
          buyerEmail: true,
          buyerPhone: true,
          customerId: true,
          status: true,
          shippingMethodName: true,
          shippingMethodType: true,
          itemsSubtotalInCents: true,
          shippingAmountInCents: true,
          totalInCents: true,
          paymentExpiresAt: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      });
      const total = await tx.order.count({ where });
      return [rows, total] as const;
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        buyerName: `${row.buyerFirstName} ${row.buyerLastName}`,
        buyerEmail: row.buyerEmail,
        buyerPhone: row.buyerPhone,
        customerId: row.customerId,
        itemCount: row._count.items,
        status: row.status,
        shippingMethodName: row.shippingMethodName,
        shippingMethodType: row.shippingMethodType,
        itemsSubtotalInCents: row.itemsSubtotalInCents,
        shippingAmountInCents: row.shippingAmountInCents,
        totalInCents: row.totalInCents,
        paymentExpiresAt: row.paymentExpiresAt,
        createdAt: row.createdAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async find(id: string): Promise<AdminOrderDetail | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: adminDetailInclude });
    return row ? mapAdminOrder(row) : null;
  }

  transition(command: AdminOrderTransitionCommand): Promise<AdminOrderMutationResult> {
    return this.transitionAndReload(command);
  }

  private async transitionAndReload(command: AdminOrderTransitionCommand): Promise<AdminOrderMutationResult> {
    const outcome = await this.run(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: command.orderId }, select: { status: true } });
      if (!current) return "missing" as const;
      if (current.status === command.toStatus) {
        return "unchanged" as const;
      }
      const updated = await tx.order.updateMany({
        where: { id: command.orderId, status: command.fromStatus },
        data: { status: command.toStatus, updatedAt: command.changedAt },
      });
      if (updated.count !== 1) throw new ConflictError("El pedido cambió en simultáneo.");
      await tx.orderStatusHistory.create({ data: {
        orderId: command.orderId,
        fromStatus: command.fromStatus,
        toStatus: command.toStatus,
        reason: command.reason,
        actorUserId: command.actorUserId,
        createdAt: command.changedAt,
      } });
      await createAudit(tx, command.actorUserId, "order.status_change", command.orderId, {
        fromStatus: command.fromStatus,
        toStatus: command.toStatus,
      }, command.changedAt);
      return "changed" as const;
    });
    return { changed: outcome === "changed", order: outcome === "missing" ? null : await this.find(command.orderId) };
  }

  cancelPending(command: AdminOrderCancellationCommand): Promise<AdminOrderMutationResult> {
    return this.cancelAndReload(command);
  }

  private async cancelAndReload(command: AdminOrderCancellationCommand): Promise<AdminOrderMutationResult> {
    const outcome = await this.run(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: command.orderId },
        include: { items: { include: { productVariant: { include: { inventory: true } } } } },
      });
      if (!order) return "missing" as const;
      if (order.status === "CANCELLED" && order.reservationReleasedAt) {
        return "unchanged" as const;
      }
      if (order.status !== "PENDING_PAYMENT" || order.reservationReleasedAt) {
        throw new ConflictError("El pedido ya no puede cancelarse o su reserva ya fue liberada.");
      }
      for (const item of order.items) {
        const inventory = item.productVariant?.inventory;
        if (!inventory) throw new ConflictError("No se encontró el inventario reservado del pedido.");
        const stockReserved = calculateReservationRelease(
          inventory.stockOnHand,
          inventory.stockReserved,
          item.quantity,
        );
        const released = await tx.inventory.updateMany({
          where: { id: inventory.id, version: inventory.version },
          data: { stockReserved, version: { increment: 1 } },
        });
        if (released.count !== 1) throw new ConflictError("El inventario cambió durante la cancelación.");
      }
      const cancelled = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT", reservationReleasedAt: null },
        data: { status: "CANCELLED", reservationReleasedAt: command.changedAt, updatedAt: command.changedAt },
      });
      if (cancelled.count !== 1) throw new ConflictError("El pedido cambió durante la cancelación.");
      await tx.orderStatusHistory.create({ data: {
        orderId: order.id,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "CANCELLED",
        reason: command.reason,
        actorUserId: command.actorUserId,
        createdAt: command.changedAt,
      } });
      await createAudit(tx, command.actorUserId, "order.cancel", order.id, {
        fromStatus: "PENDING_PAYMENT",
        toStatus: "CANCELLED",
        reservationReleased: true,
      }, command.changedAt);
      return "changed" as const;
    });
    return { changed: outcome === "changed", order: outcome === "missing" ? null : await this.find(command.orderId) };
  }

  async addNote(input: Readonly<{ orderId: string; actorUserId: string; content: string; createdAt: Date }>): Promise<AdminOrderDetail | null> {
    const found = await this.run(async (tx) => {
      if (!(await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true } }))) return false;
      await tx.orderNote.create({ data: input });
      await createAudit(tx, input.actorUserId, "order.note_create", input.orderId, undefined, input.createdAt);
      return true;
    });
    return found ? this.find(input.orderId) : null;
  }

  private async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      if (error instanceof Error && "code" in error && String(error.code) === "P2034") {
        throw new ConflictError("La operación coincidió con otro cambio; volvé a intentar.");
      }
      throw error;
    }
  }
}

function adminOrderWhere(query: AdminOrderListQuery): Prisma.OrderWhereInput {
  const conditions: Prisma.OrderWhereInput[] = [];
  if (query.search) {
    const textConditions: Prisma.OrderWhereInput[] = [
      { buyerFirstName: { contains: query.search, mode: "insensitive" } },
      { buyerLastName: { contains: query.search, mode: "insensitive" } },
      { buyerEmail: { contains: query.search, mode: "insensitive" } },
      { buyerPhone: { contains: query.search, mode: "insensitive" } },
    ];
    if (/^#?\d{1,20}$/.test(query.search)) {
      const orderNumber = BigInt(query.search.replace(/^#/, ""));
      if (orderNumber <= 9_223_372_036_854_775_807n) textConditions.push({ number: orderNumber });
    }
    conditions.push({ OR: textConditions });
  }
  if (query.status) conditions.push({ status: query.status });
  if (query.ownerType) conditions.push(query.ownerType === "customer" ? { customerId: { not: null } } : { customerId: null });
  if (query.shippingMethodId) conditions.push({ shippingMethodId: query.shippingMethodId });
  if (query.createdFrom || query.createdToExclusive) {
    conditions.push({ createdAt: {
      ...(query.createdFrom ? { gte: query.createdFrom } : {}),
      ...(query.createdToExclusive ? { lt: query.createdToExclusive } : {}),
    } });
  }
  return conditions.length ? { AND: conditions } : {};
}

function adminOrderBy(sort: AdminOrderSort): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }, { id: "asc" }];
    case "number-asc": return [{ number: "asc" }];
    case "number-desc": return [{ number: "desc" }];
    case "total-asc": return [{ totalInCents: "asc" }, { createdAt: "desc" }];
    case "total-desc": return [{ totalInCents: "desc" }, { createdAt: "desc" }];
    default: return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function mapAdminOrder(row: AdminOrderRow): AdminOrderDetail {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    status: row.status,
    buyerFirstName: row.buyerFirstName,
    buyerLastName: row.buyerLastName,
    buyerEmail: row.buyerEmail,
    buyerPhone: row.buyerPhone,
    shippingMethodName: row.shippingMethodName,
    shippingMethodType: row.shippingMethodType,
    shippingRequiresAddress: row.shippingRequiresAddress,
    shippingRecipientFirstName: row.shippingRecipientFirstName,
    shippingRecipientLastName: row.shippingRecipientLastName,
    shippingPhone: row.shippingPhone,
    shippingStreet: row.shippingStreet,
    shippingStreetNumber: row.shippingStreetNumber,
    shippingFloorApartment: row.shippingFloorApartment,
    shippingCity: row.shippingCity,
    shippingProvince: row.shippingProvince,
    shippingPostalCode: row.shippingPostalCode,
    shippingReferences: row.shippingReferences,
    itemsSubtotalInCents: row.itemsSubtotalInCents,
    shippingAmountInCents: row.shippingAmountInCents,
    discountAmountInCents: row.discountAmountInCents,
    totalInCents: row.totalInCents,
    paymentExpiresAt: row.paymentExpiresAt,
    reservationReleasedAt: row.reservationReleasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items,
    history: row.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorUserId: entry.actorUserId,
      actorName: entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : null,
      actorEmail: entry.actor?.email ?? null,
      createdAt: entry.createdAt,
    })),
    notes: row.notes.map((note) => ({
      id: note.id,
      content: note.content,
      actorUserId: note.actorUserId,
      actorName: `${note.actor.firstName} ${note.actor.lastName}`,
      actorEmail: note.actor.email,
      createdAt: note.createdAt,
    })),
  };
}

async function createAudit(
  tx: Transaction,
  actorUserId: string,
  action: string,
  orderId: string,
  metadata: Prisma.InputJsonValue | undefined,
  createdAt: Date,
): Promise<void> {
  await tx.auditLog.create({ data: {
    actorUserId,
    action,
    entityType: "Order",
    entityId: orderId,
    ...(metadata ? { metadata } : {}),
    createdAt,
  } });
}
