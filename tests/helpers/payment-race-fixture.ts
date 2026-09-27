import { vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaOrderRepository } from "@/modules/orders/infrastructure/prisma-order-repository";
import { StartPaymentCheckout } from "@/modules/payments/application/start-payment-checkout";
import { ProcessMercadoPagoWebhook } from "@/modules/payments/application/process-mercado-pago-webhook";
import type { ExternalCheckout, ExternalPaymentState, PaymentGateway } from "@/modules/payments/application/payment-gateway";
import type { PaymentAttempt } from "@/modules/payments/domain/payment";
import { PrismaPaymentAttemptRepository } from "@/modules/payments/infrastructure/prisma-payment-attempt-repository";
import { PrismaPaymentEventRepository } from "@/modules/payments/infrastructure/prisma-payment-event-repository";
import { PrismaPaymentConfirmationUnitOfWork } from "@/modules/payments/infrastructure/prisma-payment-confirmation-unit-of-work";

export const now = new Date("2026-09-27T12:00:00Z");
export const orderId = "10000000-0000-4000-8000-000000000001";
export const customerId = "10000000-0000-4000-8000-000000000002";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; orderBy?: Array<Record<string, "asc" | "desc">>; take?: number };
const duplicate = () => Object.assign(new Error("test database unique constraint"), { code: "P2002" });

// Only operations used by these real Prisma adapters are modeled. Reads return
// detached copies; WHERE predicates are evaluated, never silently discarded.
// This is NOT a MongoDB isolation/locking simulation. Transactions are serialized
// to model committed visibility; provider calls may overlap using test barriers.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
    if (key === "provider_providerEventId") return matches(row, value as Row);
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const filter = value as Row;
      if ("in" in filter) return (filter.in as unknown[]).includes(row[key]);
      if ("lt" in filter) return (row[key] as Date) < (filter.lt as Date);
      if ("lte" in filter) return (row[key] as Date) <= (filter.lte as Date);
      if ("gt" in filter) return (row[key] as string) > (filter.gt as string);
      if ("isSet" in filter) return (row[key] !== undefined) === filter.isSet;
      throw new Error(`Unsupported test WHERE: ${key}`);
    }
    if (value instanceof Date) return row[key] instanceof Date && (row[key] as Date).getTime() === value.getTime();
    return row[key] === value;
  });
}

function table(initial: Row[] = [], unique: (next: Row, rows: Row[]) => boolean = () => true, updatedAt?: Date) {
  let rows = structuredClone(initial);
  function apply(row: Row, data: Row) {
    const next = { ...row };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      next[key] = value && typeof value === "object" && "increment" in value
        ? Number(row[key]) + Number(value.increment) : value;
    }
    if (!unique(next, rows.filter((other) => other.id !== row.id))) throw duplicate();
    if (updatedAt) next.updatedAt = updatedAt;
    Object.assign(row, structuredClone(next));
  }
  return {
    get rows() { return rows; },
    restore(snapshot: Row[]) { rows = snapshot; },
    findMany: vi.fn(async ({ where, orderBy, take }: Query) => {
      const candidates = rows.filter((row) => matches(row, where));
      if (orderBy) candidates.sort((a, b) => {
        for (const clause of orderBy) {
          const [key, direction] = Object.entries(clause)[0]!;
          const left = a[key] as string, right = b[key] as string;
          const delta = left < right ? -1 : left > right ? 1 : 0;
          if (delta) return direction === "desc" ? -delta : delta;
        }
        return 0;
      });
      return structuredClone(candidates.slice(0, take));
    }),
    findFirst: vi.fn(async ({ where, orderBy }: Query) => {
      const candidates = rows.filter((row) => matches(row, where));
      if (orderBy) candidates.sort((a, b) => {
        for (const clause of orderBy) {
          const [key, direction] = Object.entries(clause)[0]!;
          const delta = Number(a[key]) - Number(b[key]);
          if (delta) return direction === "desc" ? -delta : delta;
        }
        return 0;
      });
      return structuredClone(candidates[0] ?? null);
    }),
    findUnique: vi.fn(async ({ where }: Query) => structuredClone(rows.find((row) => matches(row, where)) ?? null)),
    findUniqueOrThrow: vi.fn(async ({ where }: Query) => {
      const row = rows.find((row) => matches(row, where));
      if (!row) throw new Error("test database lookup target missing");
      return structuredClone(row);
    }),
    create: vi.fn(async ({ data }: Query) => {
      const row = structuredClone({ id: `test-row-${rows.length}`, ...data });
      if (!unique(row, rows)) throw duplicate();
      rows.push(row);
      return structuredClone(row);
    }),
    update: vi.fn(async ({ where, data }: Query) => {
      const row = rows.find((row) => matches(row, where));
      if (!row) throw new Error("test database update target missing");
      apply(row, data!);
      return structuredClone(row);
    }),
    updateMany: vi.fn(async ({ where, data }: Query) => {
      const targets = rows.filter((row) => matches(row, where));
      for (const row of targets) apply(row, data!);
      return { count: targets.length };
    }),
  };
}

export function authoritative(overrides: Partial<ExternalPaymentState> = {}): ExternalPaymentState {
  return {
    provider: "MERCADO_PAGO", providerResourceId: "MP-RACE-1",
    providerStatus: "processed", providerStatusDetail: "accredited",
    externalReference: "lauril-order-10001-attempt-1", currency: "ARS",
    totalAmountInCents: 4600n, totalPaidAmountInCents: 4600n,
    approvedAt: null, rejectedAt: null, refundedAmountInCents: 0n,
    paymentTransactionId: null, ...overrides,
  };
}

export function creationResponse(): ExternalCheckout {
  return {
    ...authoritative({ providerStatus: "created", providerStatusDetail: "created", totalPaidAmountInCents: 0n }),
    checkoutUrl: "https://checkout.example.test/race-1",
  };
}

export function paymentRaceFixture(updatedAt?: Date) {
  const active = (row: Row) => ["CREATED", "PENDING"].includes(String(row.status));
  const paymentAttempt = table([], (next, rows) => !rows.some((row) =>
    row.id === next.id || row.idempotencyKey === next.idempotencyKey
    || (row.orderId === next.orderId && row.attemptNumber === next.attemptNumber)
    || (row.orderId === next.orderId && active(row) && active(next))
    || (typeof next.providerResourceId === "string" && row.provider === next.provider && row.providerResourceId === next.providerResourceId)), updatedAt);
  const paymentEvent = table([], (next, rows) => !rows.some((row) => row.provider === next.provider && row.providerEventId === next.providerEventId));
  const inventory = table([{ id: "inventory-1", stockOnHand: 100, stockReserved: 5, version: 7 }]);
  const inventoryMovement = table([], (next, rows) => !rows.some((row) =>
    next.type === "SALE" && next.referenceType === "ORDER" && row.type === next.type
    && row.referenceType === next.referenceType && row.referenceId === next.referenceId && row.inventoryId === next.inventoryId));
  const orderStatusHistory = table();
  const order = table([{
    id: orderId, customerId, number: 10001n, status: "PENDING_PAYMENT",
    buyerEmail: "buyer@example.test", totalInCents: 4600n, currency: "ARS",
    paymentExpiresAt: new Date(now.getTime() + 60_000), reservationReleasedAt: null,
  }]);
  const findOrder = order.findUnique;
  order.findUnique = vi.fn(async (query: Query) => {
    const row = await findOrder(query);
    return row ? { ...row, items: [{ quantity: 2, productVariant: { inventory: structuredClone(inventory.rows[0]) } }] } : null;
  });
  const customer = table([{
    id: customerId, userId: "10000000-0000-4000-8000-000000000003", status: "ACTIVE", phone: "123456",
    user: { status: "ACTIVE", firstName: "Test", lastName: "Customer", email: "buyer@example.test" },
  }]);
  const paymentRefund = table();
  const paymentReconciliationCheckpoint = table([], (next, rows) => !rows.some((row) => row.id === next.id));
  const tables = [paymentAttempt, paymentEvent, inventory, inventoryMovement, orderStatusHistory, order, customer, paymentRefund];
  let transactionTail = Promise.resolve();
  const client = {
    paymentAttempt, paymentEvent, inventory, inventoryMovement, orderStatusHistory, order, customer, paymentRefund, paymentReconciliationCheckpoint,
    $transaction: async <T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> => {
      const previous = transactionTail;
      const finished = deferred<void>();
      transactionTail = finished.promise;
      await previous;
      const before = tables.map((item) => structuredClone(item.rows));
      try { return await work(client as unknown as PrismaClient); }
      catch (error) {
        tables.forEach((item, index) => item.restore(before[index]!));
        throw error;
      }
      finally { finished.resolve(); }
    },
  };
  const prisma = client as unknown as PrismaClient;
  const attempts = new PrismaPaymentAttemptRepository(prisma);
  const events = new PrismaPaymentEventRepository(prisma);
  const gateway = {
    createCheckout: vi.fn<PaymentGateway["createCheckout"]>().mockResolvedValue(creationResponse()),
    getPaymentState: vi.fn<PaymentGateway["getPaymentState"]>().mockResolvedValue(authoritative()),
    refundOrder: vi.fn<PaymentGateway["refundOrder"]>().mockRejectedValue(new Error("unexpected refund request")),
  } satisfies PaymentGateway;
  const start = new StartPaymentCheckout(new PrismaOrderRepository(prisma), attempts, gateway);
  const webhook = new ProcessMercadoPagoWebhook(attempts, events, gateway, new PrismaPaymentConfirmationUnitOfWork(prisma));
  return {
    client, gateway, attempts, events, webhook,
    start: () => start.execute(orderId, customerId, now),
    get attempt() { return paymentAttempt.rows[0] as unknown as PaymentAttempt; },
    get order() { return order.rows[0]!; },
    get inventory() { return inventory.rows[0]!; },
    get sales() { return inventoryMovement.rows; },
  };
}

export function webhookInput(providerEventId: string) {
  return { providerEventId, providerResourceId: "MP-RACE-1", eventType: "order", action: "updated", requestId: "req-race", receivedAt: now };
}
