import type { InventoryMovementType } from "../domain/inventory";

export const inventorySorts = ["updated-desc", "product-asc", "stock-asc", "stock-desc"] as const;
export type InventorySort = (typeof inventorySorts)[number];

export type InventoryAdminQuery = Readonly<{
  page: number; pageSize: number; sort: InventorySort; search?: string; lowStockOnly?: boolean;
}>;

export type InventoryMovementQuery = Readonly<{
  page: number; pageSize: number; search?: string; type?: InventoryMovementType;
  createdFrom?: Date; createdToExclusive?: Date;
}>;

export type InventoryAdminRow = Readonly<{
  id: string; productId: string; variantId: string; productName: string; variantName: string; sku: string;
  stockOnHand: number; stockReserved: number; stockAvailable: number; minimumStock: number; isLowStock: boolean; updatedAt: Date;
}>;

export type InventoryMovementRow = Readonly<{
  id: string; inventoryId: string; productId: string; variantId: string; productName: string; variantName: string; sku: string;
  type: InventoryMovementType; quantity: number; stockBefore: number; stockAfter: number; reason: string;
  referenceType: string | null; referenceId: string | null; actorName: string; actorEmail: string | null; createdAt: Date;
}>;

export type AdminPage<T> = Readonly<{ items: ReadonlyArray<T>; total: number; page: number; pageSize: number; pageCount: number }>;

export interface InventoryAdminRepository {
  listInventory(query: InventoryAdminQuery): Promise<AdminPage<InventoryAdminRow>>;
  listMovements(query: InventoryMovementQuery): Promise<AdminPage<InventoryMovementRow>>;
}
