import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AuditPage, AuditQuery, AuditRepository } from "../application/audit-repository";

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: AuditQuery): Promise<AuditPage> {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.search) and.push({ OR: [
      { action: { contains: query.search, mode: "insensitive" } },
      { entityType: { contains: query.search, mode: "insensitive" } },
      { entityId: { contains: query.search, mode: "insensitive" } },
      { actor: { email: { contains: query.search, mode: "insensitive" } } },
      { actor: { firstName: { contains: query.search, mode: "insensitive" } } },
      { actor: { lastName: { contains: query.search, mode: "insensitive" } } },
    ] });
    if (query.action) and.push({ action: query.action });
    if (query.entityType) and.push({ entityType: query.entityType });
    if (query.createdFrom || query.createdToExclusive) and.push({ createdAt: {
      ...(query.createdFrom ? { gte: query.createdFrom } : {}),
      ...(query.createdToExclusive ? { lt: query.createdToExclusive } : {}),
    } });
    const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize,
        take: query.pageSize, include: { actor: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id, action: row.action, entityType: row.entityType, entityId: row.entityId,
        metadata: row.metadata, ipAddress: row.ipAddress,
        actorName: row.actor ? `${row.actor.firstName} ${row.actor.lastName}`.trim() : "Sistema",
        actorEmail: row.actor?.email ?? null, createdAt: row.createdAt,
      })),
      total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listFacets() {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ["action"], orderBy: { action: "asc" }, select: { action: true } }),
      this.prisma.auditLog.findMany({ distinct: ["entityType"], orderBy: { entityType: "asc" }, select: { entityType: true } }),
    ]);
    return { actions: actions.map(({ action }) => action), entityTypes: entityTypes.map(({ entityType }) => entityType) };
  }
}
