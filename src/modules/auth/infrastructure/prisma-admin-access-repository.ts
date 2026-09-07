import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError, NotFoundError } from "@/shared/domain/errors";
import type { AdminAccessRepository } from "../application/admin-access-repository";

export class PrismaAdminAccessRepository implements AdminAccessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAdmins() {
    const rows = await this.prisma.user.findMany({
      where: { roles: { some: { role: { permissions: { some: { permission: { code: "admin.access" } } } } } } },
      orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true, email: true, firstName: true, lastName: true, status: true, lastLoginAt: true, createdAt: true,
        roles: { orderBy: { role: { name: "asc" } }, select: { role: { select: { id: true, code: true, name: true } } } },
      },
    });
    return rows.map((row) => ({ ...row, roles: row.roles.map(({ role }) => role) }));
  }

  async listRoles() {
    const rows = await this.prisma.role.findMany({
      orderBy: { name: "asc" },
      include: {
        permissions: { orderBy: { permission: { code: "asc" } }, include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return rows.map((role) => ({
      id: role.id, code: role.code, name: role.name, description: role.description,
      userCount: role._count.users,
      permissions: role.permissions.map(({ permission }) => ({ code: permission.code, name: permission.name })),
    }));
  }

  async rolesGrantAdminAccess(roleIds: ReadonlyArray<string>): Promise<boolean> {
    if (roleIds.length === 0) return false;
    return (await this.prisma.role.count({
      where: { id: { in: [...roleIds] }, permissions: { some: { permission: { code: "admin.access" } } } },
    })) > 0;
  }

  async createAdmin(input: Parameters<AdminAccessRepository["createAdmin"]>[0]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const roleCount = await tx.role.count({ where: { id: { in: [...input.roleIds] } } });
        if (roleCount !== input.roleIds.length) throw new NotFoundError("Uno de los roles no existe.");
        const user = await tx.user.create({ data: {
          email: input.email, passwordHash: input.passwordHash, firstName: input.firstName, lastName: input.lastName, status: "ACTIVE",
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        }, select: { id: true } });
        await tx.auditLog.create({ data: {
          actorUserId: input.actorUserId, action: "admin.create", entityType: "User", entityId: user.id,
          metadata: { roleIds: input.roleIds }, createdAt: input.occurredAt,
        } });
        return user;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Ya existe una cuenta con ese email.");
      }
      throw error;
    }
  }

  async setStatus(input: Parameters<AdminAccessRepository["setStatus"]>[0]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: { id: input.userId, roles: { some: { role: { permissions: { some: { permission: { code: "admin.access" } } } } } } },
        select: { status: true },
      });
      if (!target) throw new NotFoundError("No se encontró el administrador.");
      if (target.status === input.status) return;
      if (input.status === "DISABLED") {
        const activeAdmins = await tx.user.count({
          where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { code: "admin.access" } } } } } } },
        });
        if (activeAdmins <= 1) throw new ConflictError("El sistema debe conservar al menos un administrador activo.");
      }
      await tx.user.update({ where: { id: input.userId }, data: { status: input.status, updatedAt: input.occurredAt } });
      if (input.status === "DISABLED") {
        await tx.session.updateMany({ where: { userId: input.userId, revokedAt: null }, data: { revokedAt: input.occurredAt } });
      }
      await tx.auditLog.create({ data: {
        actorUserId: input.actorUserId, action: "admin.status_change", entityType: "User", entityId: input.userId,
        metadata: { fromStatus: target.status, toStatus: input.status }, createdAt: input.occurredAt,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateRoles(input: Parameters<AdminAccessRepository["updateRoles"]>[0]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!target) throw new NotFoundError("No se encontró el administrador.");
      const roleCount = await tx.role.count({ where: { id: { in: [...input.roleIds] } } });
      if (roleCount !== input.roleIds.length) throw new NotFoundError("Uno de los roles no existe.");
      await tx.userRole.deleteMany({ where: { userId: input.userId } });
      await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: input.userId, roleId })) });
      await tx.auditLog.create({ data: {
        actorUserId: input.actorUserId, action: "admin.roles_change", entityType: "User", entityId: input.userId,
        metadata: { roleIds: input.roleIds }, createdAt: input.occurredAt,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
