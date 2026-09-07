import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type {
  AdminCustomerDetail, AdminCustomerListQuery, AdminCustomerPage,
  CustomerAdminRepository, CustomerAdminSort,
} from "../application/customer-admin-repository";

const detailInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  addresses: { orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }] },
  orders: {
    orderBy: { createdAt: "desc" as const }, take: 50,
    select: { id: true, number: true, status: true, totalInCents: true, shippingMethodName: true, shippingMethodType: true, createdAt: true },
  },
  notes: {
    orderBy: { createdAt: "desc" as const },
    include: { actor: { select: { firstName: true, lastName: true, email: true } } },
  },
} satisfies Prisma.CustomerInclude;

type DetailRow = Prisma.CustomerGetPayload<{ include: typeof detailInclude }>;

export class PrismaCustomerAdminRepository implements CustomerAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: AdminCustomerListQuery): Promise<AdminCustomerPage> {
    const where = customerWhere(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where, orderBy: customerOrderBy(query.sort), skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: {
          id: true, phone: true, status: true, createdAt: true, updatedAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id, firstName: row.user.firstName, lastName: row.user.lastName,
        email: row.user.email, phone: row.phone, status: row.status,
        orderCount: row._count.orders, createdAt: row.createdAt, updatedAt: row.updatedAt,
      })),
      total, page: query.page, pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async find(id: string): Promise<AdminCustomerDetail | null> {
    const row = await this.prisma.customer.findUnique({ where: { id }, include: detailInclude });
    return row ? mapDetail(row) : null;
  }

  async updateProfile(input: Parameters<CustomerAdminRepository["updateProfile"]>[0]) {
    const exists = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { userId: true } });
      if (!customer) return false;
      await tx.user.update({ where: { id: customer.userId }, data: { firstName: input.firstName, lastName: input.lastName, updatedAt: input.occurredAt } });
      await tx.customer.update({ where: { id: input.customerId }, data: { phone: input.phone, document: input.document, updatedAt: input.occurredAt } });
      await tx.auditLog.create({ data: {
        actorUserId: input.actorUserId, action: "customer.admin_update", entityType: "Customer",
        entityId: input.customerId, metadata: { fields: ["firstName", "lastName", "phone", "document"] }, createdAt: input.occurredAt,
      } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return exists ? this.find(input.customerId) : null;
  }

  async setStatus(input: Parameters<CustomerAdminRepository["setStatus"]>[0]) {
    const changed = await this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id: input.customerId }, select: { status: true } });
      if (!current) return false;
      if (current.status === input.status) return true;
      await tx.customer.update({ where: { id: input.customerId }, data: { status: input.status, updatedAt: input.occurredAt } });
      await tx.auditLog.create({ data: {
        actorUserId: input.actorUserId, action: "customer.status_change", entityType: "Customer", entityId: input.customerId,
        metadata: { fromStatus: current.status, toStatus: input.status }, createdAt: input.occurredAt,
      } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return changed ? this.find(input.customerId) : null;
  }

  async addNote(input: Parameters<CustomerAdminRepository["addNote"]>[0]) {
    const created = await this.prisma.$transaction(async (tx) => {
      if (!(await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }))) return false;
      await tx.customerNote.create({ data: { customerId: input.customerId, actorUserId: input.actorUserId, content: input.content, createdAt: input.occurredAt } });
      await tx.auditLog.create({ data: {
        actorUserId: input.actorUserId, action: "customer.note_create", entityType: "Customer", entityId: input.customerId,
        createdAt: input.occurredAt,
      } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return created ? this.find(input.customerId) : null;
  }
}

function customerWhere(query: AdminCustomerListQuery): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [];
  if (query.search) and.push({ OR: [
    { user: { firstName: { contains: query.search, mode: "insensitive" } } },
    { user: { lastName: { contains: query.search, mode: "insensitive" } } },
    { user: { email: { contains: query.search, mode: "insensitive" } } },
    { phone: { contains: query.search, mode: "insensitive" } },
  ] });
  if (query.status) and.push({ status: query.status });
  if (query.orderPresence) and.push(query.orderPresence === "with-orders" ? { orders: { some: {} } } : { orders: { none: {} } });
  if (query.createdFrom || query.createdToExclusive) and.push({ createdAt: {
    ...(query.createdFrom ? { gte: query.createdFrom } : {}),
    ...(query.createdToExclusive ? { lt: query.createdToExclusive } : {}),
  } });
  return and.length ? { AND: and } : {};
}

function customerOrderBy(sort: CustomerAdminSort): Prisma.CustomerOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }, { id: "asc" }];
    case "name-asc": return [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }];
    case "name-desc": return [{ user: { lastName: "desc" } }, { user: { firstName: "desc" } }];
    case "updated-desc": return [{ updatedAt: "desc" }, { id: "desc" }];
    default: return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function mapDetail(row: DetailRow): AdminCustomerDetail {
  return {
    id: row.id, userId: row.userId, firstName: row.user.firstName, lastName: row.user.lastName,
    email: row.user.email, phone: row.phone, document: row.document, status: row.status,
    createdAt: row.createdAt, updatedAt: row.updatedAt, addresses: row.addresses,
    orders: row.orders,
    notes: row.notes.map((note) => ({
      id: note.id, content: note.content,
      actorName: `${note.actor.firstName} ${note.actor.lastName}`.trim(), actorEmail: note.actor.email, createdAt: note.createdAt,
    })),
  };
}
