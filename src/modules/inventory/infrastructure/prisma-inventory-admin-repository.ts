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
    const search = query.search ?? null;
    const pattern = query.search ? `%${query.search}%` : null;
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; product_id: string; variant_id: string; product_name: string; variant_name: string; sku: string;
      stock_on_hand: number; stock_reserved: number; minimum_stock: number; updated_at: Date; total_count: bigint;
    }>>(Prisma.sql`
      SELECT i.id, p.id AS product_id, v.id AS variant_id, p.name AS product_name, v.name AS variant_name, v.sku,
             i.stock_on_hand, i.stock_reserved, i.minimum_stock, i.updated_at, count(*) OVER() AS total_count
      FROM inventory i
      JOIN product_variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE i.stock_on_hand - i.stock_reserved <= i.minimum_stock
        AND (${search}::text IS NULL OR p.name ILIKE ${pattern} OR v.name ILIKE ${pattern} OR v.sku ILIKE ${pattern})
      ORDER BY i.updated_at DESC, i.id DESC
      OFFSET ${(query.page - 1) * query.pageSize} LIMIT ${query.pageSize}
    `);
    const items = rows.map((row) => ({
      id: row.id, productId: row.product_id, variantId: row.variant_id, productName: row.product_name,
      variantName: row.variant_name, sku: row.sku, stockOnHand: row.stock_on_hand, stockReserved: row.stock_reserved,
      stockAvailable: calculateAvailableStock(row.stock_on_hand, row.stock_reserved), minimumStock: row.minimum_stock,
      isLowStock: true, updatedAt: row.updated_at,
    }));
    return adminPage(items, Number(rows[0]?.total_count ?? 0n), query);
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
