import { describe, expect, it } from "vitest";
import { OrderAdminService } from "@/modules/orders/application/order-admin-service";
import type {
  AdminOrderCancellationCommand,
  AdminOrderDetail,
  AdminOrderListQuery,
  AdminOrderMutationResult,
  AdminOrderTransitionCommand,
  OrderAdminRepository,
} from "@/modules/orders/application/order-admin-repository";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";

const orderId = "20000000-0000-4000-8000-000000000001";
const adminId = "20000000-0000-4000-8000-000000000002";
const now = new Date("2026-09-01T15:00:00.000Z");

class MemoryAdminRepository implements OrderAdminRepository {
  order: AdminOrderDetail | null = detail();
  lastQuery: AdminOrderListQuery | null = null;
  transitions: AdminOrderTransitionCommand[] = [];
  cancellations: AdminOrderCancellationCommand[] = [];
  cancellationConflicts = 0;

  list(query: AdminOrderListQuery) {
    this.lastQuery = query;
    return Promise.resolve({ items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 });
  }
  find(id: string) { return Promise.resolve(this.order?.id === id ? this.order : null); }
  transition(command: AdminOrderTransitionCommand): Promise<AdminOrderMutationResult> {
    this.transitions.push(command);
    if (!this.order) return Promise.resolve({ changed: false, order: null });
    this.order = { ...this.order, status: command.toStatus };
    return Promise.resolve({ changed: true, order: this.order });
  }
  cancelPending(command: AdminOrderCancellationCommand): Promise<AdminOrderMutationResult> {
    if (this.cancellationConflicts > 0) {
      this.cancellationConflicts -= 1;
      return Promise.reject(new ConflictError("Conflicto concurrente"));
    }
    this.cancellations.push(command);
    if (!this.order) return Promise.resolve({ changed: false, order: null });
    this.order = { ...this.order, status: "CANCELLED", reservationReleasedAt: command.changedAt };
    return Promise.resolve({ changed: true, order: this.order });
  }
  addNote(input: Readonly<{ orderId: string; actorUserId: string; content: string; createdAt: Date }>) {
    if (!this.order || input.orderId !== this.order.id) return Promise.resolve(null);
    this.order = { ...this.order, notes: [{ id: "note", content: input.content, actorUserId: input.actorUserId, actorName: "Admin Test", actorEmail: "admin@test.local", createdAt: input.createdAt }] };
    return Promise.resolve(this.order);
  }
}

describe("order admin service", () => {
  it("normaliza búsqueda, filtros, paginación y fechas de Argentina", async () => {
    const repository = new MemoryAdminRepository();
    await new OrderAdminService(repository).list({ page: 2, pageSize: 500, search: "  Ana  ", status: "PAID", ownerType: "customer", shippingMethodId: "20000000-0000-4000-8000-000000000003", createdFrom: "2026-09-01", createdTo: "2026-09-02", sort: "total-desc" });
    expect(repository.lastQuery).toMatchObject({ page: 2, pageSize: 100, search: "Ana", status: "PAID", ownerType: "customer", sort: "total-desc" });
    expect(repository.lastQuery?.createdFrom?.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(repository.lastQuery?.createdToExclusive?.toISOString()).toBe("2026-09-03T03:00:00.000Z");
  });

  it("rechaza fechas manipuladas", async () => {
    expect(() => new OrderAdminService(new MemoryAdminRepository()).list({ createdFrom: "ayer" })).toThrow(ValidationError);
    expect(() => new OrderAdminService(new MemoryAdminRepository()).list({ createdFrom: "2026-02-31" })).toThrow(ValidationError);
  });

  it("devuelve acciones válidas según estado y entrega", async () => {
    const repository = new MemoryAdminRepository();
    repository.order = detail({ status: "READY_TO_SHIP", shippingMethodType: "PICKUP" });
    expect((await new OrderAdminService(repository).find(orderId)).allowedTransitions).toEqual(["DELIVERED"]);
  });

  it("registra una transición válida con actor y motivo", async () => {
    const repository = new MemoryAdminRepository();
    repository.order = detail({ status: "PAID" });
    await new OrderAdminService(repository).transition({ orderId, toStatus: "PREPARING", actorUserId: adminId, reason: "Comienza armado" }, now);
    expect(repository.transitions[0]).toMatchObject({ fromStatus: "PAID", toStatus: "PREPARING", actorUserId: adminId, reason: "Comienza armado" });
  });

  it("deriva la cancelación pendiente al flujo que libera reserva", async () => {
    const repository = new MemoryAdminRepository();
    await new OrderAdminService(repository).transition({ orderId, toStatus: "CANCELLED", actorUserId: adminId }, now);
    expect(repository.cancellations).toHaveLength(1);
    expect(repository.order).toMatchObject({ status: "CANCELLED", reservationReleasedAt: now });
  });

  it("hace idempotente una repetición del mismo estado", async () => {
    const repository = new MemoryAdminRepository();
    repository.order = detail({ status: "PREPARING" });
    expect(await new OrderAdminService(repository).transition({ orderId, toStatus: "PREPARING", actorUserId: adminId }, now)).toMatchObject({ changed: false });
    expect(repository.transitions).toHaveLength(0);
  });

  it("reintenta una cancelación concurrente segura", async () => {
    const repository = new MemoryAdminRepository();
    repository.cancellationConflicts = 1;
    expect(await new OrderAdminService(repository).transition({ orderId, toStatus: "CANCELLED", actorUserId: adminId }, now)).toMatchObject({ changed: true });
    expect(repository.cancellations).toHaveLength(1);
  });

  it("no permite marcar pagado desde administración", async () => {
    await expect(new OrderAdminService(new MemoryAdminRepository()).transition({ orderId, toStatus: "PAID", actorUserId: adminId }, now)).rejects.toThrow(ValidationError);
  });

  it("crea una nota normalizada y falla para pedido inexistente", async () => {
    const repository = new MemoryAdminRepository();
    const service = new OrderAdminService(repository);
    expect((await service.addNote({ orderId, actorUserId: adminId, content: "  Revisar empaque  " }, now)).notes[0]?.content).toBe("Revisar empaque");
    repository.order = null;
    await expect(service.addNote({ orderId, actorUserId: adminId, content: "Nota" }, now)).rejects.toThrow(NotFoundError);
  });

  it("oculta como no encontrado un id inexistente", async () => {
    const repository = new MemoryAdminRepository(); repository.order = null;
    await expect(new OrderAdminService(repository).find(orderId)).rejects.toThrow(NotFoundError);
  });
});

function detail(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    id: orderId, number: 10001n, customerId: null, status: "PENDING_PAYMENT",
    buyerFirstName: "Ana", buyerLastName: "Prueba", buyerEmail: "ana@test.local", buyerPhone: "+54 11 5555-0000",
    shippingMethodName: "Envío fijo", shippingMethodType: "FLAT_RATE", shippingRequiresAddress: true,
    shippingRecipientFirstName: "Ana", shippingRecipientLastName: "Prueba", shippingPhone: "+54 11 5555-0000",
    shippingStreet: "Calle", shippingStreetNumber: "123", shippingFloorApartment: null, shippingCity: "CABA",
    shippingProvince: "Buenos Aires", shippingPostalCode: "1000", shippingReferences: null,
    itemsSubtotalInCents: 10000n, shippingAmountInCents: 1000n, discountAmountInCents: 0n, totalInCents: 11000n,
    paymentExpiresAt: new Date(now.getTime() + 900000), reservationReleasedAt: null, createdAt: now, updatedAt: now,
    items: [], history: [], notes: [], ...overrides,
  };
}
