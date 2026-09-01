import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/shared/domain/errors";
import type { ShippingAdminRepository, ShippingMethodWrite } from "../application/shipping-admin-repository";
import type { ShippingMethodReader } from "../application/shipping-provider";
import type { ShippingMethodState } from "../domain/shipping";

export class PrismaShippingRepository implements ShippingMethodReader, ShippingAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActive(): Promise<ReadonlyArray<ShippingMethodState>> {
    return (await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })).map(mapShippingMethod);
  }

  async findActiveById(id: string): Promise<ShippingMethodState | null> {
    const row = await this.prisma.shippingMethod.findFirst({ where: { id, isActive: true } });
    return row ? mapShippingMethod(row) : null;
  }

  async listAll(): Promise<ReadonlyArray<ShippingMethodState>> {
    return (await this.prisma.shippingMethod.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })).map(mapShippingMethod);
  }

  async findById(id: string): Promise<ShippingMethodState | null> {
    const row = await this.prisma.shippingMethod.findUnique({ where: { id } });
    return row ? mapShippingMethod(row) : null;
  }

  async create(input: ShippingMethodWrite, actorUserId: string): Promise<ShippingMethodState> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const method = await tx.shippingMethod.create({ data: input });
        await audit(tx, actorUserId, "shipping_method.create", method.id);
        return mapShippingMethod(method);
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  async update(id: string, input: ShippingMethodWrite, actorUserId: string): Promise<ShippingMethodState | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await tx.shippingMethod.findUnique({ where: { id }, select: { id: true } }))) return null;
        const method = await tx.shippingMethod.update({ where: { id }, data: input });
        await audit(tx, actorUserId, "shipping_method.update", method.id);
        return mapShippingMethod(method);
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  async setActive(id: string, isActive: boolean, actorUserId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shippingMethod.updateMany({ where: { id }, data: { isActive } });
      if (updated.count !== 1) return false;
      await audit(tx, actorUserId, isActive ? "shipping_method.activate" : "shipping_method.deactivate", id);
      return true;
    });
  }
}

export function mapShippingMethod(row: Prisma.ShippingMethodGetPayload<object>): ShippingMethodState {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    type: row.type,
    costInCents: row.costInCents,
    requiresAddress: row.requiresAddress,
    minimumSubtotalInCents: row.minimumSubtotalInCents,
    freeShippingFromInCents: row.freeShippingFromInCents,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function audit(tx: Transaction, actorUserId: string, action: string, entityId: string) {
  return tx.auditLog.create({
    data: { actorUserId, action, entityType: "ShippingMethod", entityId },
  });
}

function mapError(error: unknown): Error {
  if (error instanceof Error && "code" in error && error.code === "P2002") {
    return new ConflictError("Ya existe un método con ese código.");
  }
  return error instanceof Error ? error : new Error("Error de persistencia de métodos de entrega.");
}
