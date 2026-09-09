import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateAvailableStock, isLowStock } from "../domain/inventory";
import type {
  AdminPage, InventoryAdminQuery, InventoryAdminRepository, InventoryAdminRow,
  InventoryMovementQuery, InventoryMovementRow, InventorySort,
} from "../application/inventory-admin-repository";

const inventoryInclude = {
  variant: { include: { product: { select: { id: true, name: true } } } },
} satisfies Prisma.InventoryInclude;
type InventoryRow = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

export class PrismaInventoryAdminRepository implements InventoryAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listInventory(query: InventoryAdminQuery): Promise<AdminPage<InventoryAdminRow>> {
    if (query.lowStockOnly) return this.listLowStock(query);
    const where: Prisma.InventoryWhereInput = query.search ? { variant: { OR: [
      { sku: { contains: query.search, mode: "insensitive" } },
      { name: { contains: query.search, mode: "insensitive" } },
      { product: { name: { contains: query.search, mode: "insensitive" } } },
    ] } } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where, orderBy: inventoryOrderBy(query.sort), skip: (query.page - 1) * query.pageSize,
        take: query.pageSize, include: inventoryInclude,
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return adminPage(rows.map(mapInventory), total, query);
  }

  private async listLowStock(query: InventoryAdminQuery): Promise<AdminPage<InventoryAdminRow>> {
    const where: Prisma.InventoryWhereInput = query.search ? { variant: { OR: [
      { sku: { contains: query.search, mode: "insensitive" } },
      { name: { contains: query.search, mode: "insensitive" } },
      { product: { name: { contains: query.search, mode: "insensitive" } } },
    ] } } : {};
    const rows = await this.prisma.inventory.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: inventoryInclude,
    });
    const lowStockRows = rows.filter(({ stockOnHand, stockReserved, minimumStock }) =>
      isLowStock(stockOnHand, stockReserved, minimumStock),
    );
    const offset = (query.page - 1) * query.pageSize;
    return adminPage(
      lowStockRows.slice(offset, offset + query.pageSize).map(mapInventory),
      lowStockRows.length,
      query,
    );
  }

  async listMovements(query: InventoryMovementQuery): Promise<AdminPage<InventoryMovementRow>> {
    const and: Prisma.InventoryMovementWhereInput[] = [];
    if (query.search) and.push({ OR: [
      { inventory: { variant: { sku: { contains: query.search, mode: "insensitive" } } } },
      { inventory: { variant: { name: { contains: query.search, mode: "insensitive" } } } },
      { inventory: { variant: { product: { name: { contains: query.search, mode: "insensitive" } } } } },
      { reason: { contains: query.search, mode: "insensitive" } },
    ] });
    if (query.type) and.push({ type: query.type });
    if (query.createdFrom || query.createdToExclusive) and.push({ createdAt: {
      ...(query.createdFrom ? { gte: query.createdFrom } : {}),
      ...(query.createdToExclusive ? { lt: query.createdToExclusive } : {}),
    } });
    const where: Prisma.InventoryMovementWhereInput = and.length ? { AND: and } : {};
    const include = {
      inventory: { include: { variant: { include: { product: { select: { id: true, name: true } } } } } },
      adminUser: { select: { firstName: true, lastName: true, email: true } },
    } satisfies Prisma.InventoryMovementInclude;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize, include,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return adminPage(rows.map((row) => ({
      id: row.id, inventoryId: row.inventoryId, productId: row.inventory.variant.product.id,
      variantId: row.inventory.variant.id, productName: row.inventory.variant.product.name,
      variantName: row.inventory.variant.name, sku: row.inventory.variant.sku, type: row.type,
      quantity: row.quantity, stockBefore: row.stockBefore, stockAfter: row.stockAfter, reason: row.reason,
      referenceType: row.referenceType, referenceId: row.referenceId,
      actorName: row.adminUser ? `${row.adminUser.firstName} ${row.adminUser.lastName}`.trim() : "Sistema",
      actorEmail: row.adminUser?.email ?? null, createdAt: row.createdAt,
    })), total, query);
  }
}

function mapInventory(row: InventoryRow): InventoryAdminRow {
  return {
    id: row.id, productId: row.variant.product.id, variantId: row.variant.id,
    productName: row.variant.product.name, variantName: row.variant.name, sku: row.variant.sku,
    stockOnHand: row.stockOnHand, stockReserved: row.stockReserved,
    stockAvailable: calculateAvailableStock(row.stockOnHand, row.stockReserved), minimumStock: row.minimumStock,
    isLowStock: isLowStock(row.stockOnHand, row.stockReserved, row.minimumStock), updatedAt: row.updatedAt,
  };
}

function inventoryOrderBy(sort: InventorySort): Prisma.InventoryOrderByWithRelationInput[] {
  switch (sort) {
    case "product-asc": return [{ variant: { product: { name: "asc" } } }, { variant: { name: "asc" } }];
    case "stock-asc": return [{ stockOnHand: "asc" }, { updatedAt: "desc" }];
    case "stock-desc": return [{ stockOnHand: "desc" }, { updatedAt: "desc" }];
    default: return [{ updatedAt: "desc" }, { id: "desc" }];
  }
}

function adminPage<T>(items: T[], total: number, query: { page: number; pageSize: number }): AdminPage<T> {
  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}
