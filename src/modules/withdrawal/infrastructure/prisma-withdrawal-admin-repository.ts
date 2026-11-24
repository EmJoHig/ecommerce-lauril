import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type { WithdrawalAdminRepository } from "../application/withdrawal-admin-service";
import { withdrawalStatus, type WithdrawalStatus } from "../domain/withdrawal-admin";

function statusWhere(status: WithdrawalStatus): Prisma.WithdrawalRequestWhereInput {
  return status === "PENDING" ? { OR: [{ status: "PENDING" }, { status: null }, { status: { isSet: false } }] } : { status };
}
export class PrismaWithdrawalAdminRepository implements WithdrawalAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async list(query: { page: number; search: string; status?: WithdrawalStatus }) {
    const search: Prisma.WithdrawalRequestWhereInput = !query.search ? {} : /^\d{1,18}$/.test(query.search)
      ? { orderNumber: BigInt(query.search) } : { code: { equals: query.search.toUpperCase(), mode: "insensitive" } };
    const where: Prisma.WithdrawalRequestWhereInput = { AND: [search, ...(query.status ? [statusWhere(query.status)] : [])] };
    // Dos grupos mantienen prioridad de no resueltas sin depender del orden léxico del estado ni de campos ausentes.
    const openWhere: Prisma.WithdrawalRequestWhereInput = { AND: [where, { OR: [statusWhere("PENDING"), statusWhere("IN_PROGRESS")] }] };
    const closedWhere: Prisma.WithdrawalRequestWhereInput = { AND: [where, { status: "RESOLVED" }] };
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.withdrawalRequest.count({ where: statusWhere("PENDING") });
      const inProgress = await tx.withdrawalRequest.count({ where: statusWhere("IN_PROGRESS") });
      const open = await tx.withdrawalRequest.count({ where: openWhere });
      const total = await tx.withdrawalRequest.count({ where });
      const skip = (query.page - 1) * 20;
      const select = { id: true, code: true, orderNumber: true, createdAt: true, status: true, version: true } as const;
      const orderBy = [{ createdAt: "asc" }, { id: "asc" }] as const;
      const rows = skip < open ? await tx.withdrawalRequest.findMany({ where: openWhere, select, orderBy: [...orderBy], skip, take: 20 }) : [];
      if (rows.length < 20) rows.push(...await tx.withdrawalRequest.findMany({ where: closedWhere, select, orderBy: [...orderBy], skip: Math.max(0, skip - open), take: 20 - rows.length }));
      return { items: rows.map((row) => ({ ...row, status: withdrawalStatus(row.status), version: row.version ?? 0 })), total, pending, inProgress };
    });
  }
  async find(id: string) {
    const row = await this.prisma.withdrawalRequest.findUnique({ where: { id }, include: { activities: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { actor: { select: { firstName: true, lastName: true } } } } } });
    if (!row) return null;
    return { ...row, status: withdrawalStatus(row.status), version: row.version ?? 0, activities: row.activities.map((activity) => ({ ...activity, actorName: `${activity.actor.firstName} ${activity.actor.lastName}`, toStatus: withdrawalStatus(activity.toStatus) })) };
  }
  async change(input: Parameters<WithdrawalAdminRepository["change"]>[0]) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const version: Prisma.WithdrawalRequestWhereInput = input.version === 0 ? { OR: [{ version: 0 }, { version: null }, { version: { isSet: false } }] } : { version: input.version };
        const result = await tx.withdrawalRequest.updateMany({ where: { AND: [{ id: input.id }, version, statusWhere(input.from)] }, data: { status: input.to, version: input.version + 1, ...(input.to === "RESOLVED" ? { resolution: input.content, resolvedAt: input.now } : {}) } });
        if (result.count !== 1) throw new ConflictError("La solicitud cambió. Recargá antes de continuar.");
        await tx.withdrawalActivity.create({ data: { requestId: input.id, actorUserId: input.actorUserId, content: input.content, fromStatus: input.from, toStatus: input.to, createdAt: input.now } });
        await tx.auditLog.create({ data: { actorUserId: input.actorUserId, action: "withdrawal.manage", entityType: "WithdrawalRequest", entityId: input.id, metadata: { from: input.from, to: input.to, version: input.version + 1 }, createdAt: input.now } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ConflictError("Otra persona actualizó la solicitud. Recargá antes de continuar.");
      throw error;
    }
  }
}
