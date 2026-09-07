import { businessDate, boundedPageSize, normalizedSearch, positivePage } from "@/shared/application/admin-list-query";
import { inventoryMovementTypes } from "../domain/inventory";
import { inventorySorts, type InventoryAdminRepository } from "./inventory-admin-repository";

export class InventoryAdminService {
  constructor(private readonly repository: InventoryAdminRepository) {}

  listInventory(input: Readonly<{ page?: number; pageSize?: number; search?: string; lowStock?: string; sort?: string }>) {
    const search = normalizedSearch(input.search);
    return this.repository.listInventory({
      page: positivePage(input.page), pageSize: boundedPageSize(input.pageSize),
      sort: inventorySorts.find((value) => value === input.sort) ?? "updated-desc",
      ...(search ? { search } : {}), ...(input.lowStock === "true" ? { lowStockOnly: true } : {}),
    });
  }

  listMovements(input: Readonly<{ page?: number; pageSize?: number; search?: string; type?: string; createdFrom?: string; createdTo?: string }>) {
    const search = normalizedSearch(input.search);
    const type = inventoryMovementTypes.find((value) => value === input.type);
    const createdFrom = businessDate(input.createdFrom);
    const createdToExclusive = businessDate(input.createdTo, true);
    return this.repository.listMovements({
      page: positivePage(input.page), pageSize: boundedPageSize(input.pageSize),
      ...(search ? { search } : {}), ...(type ? { type } : {}),
      ...(createdFrom ? { createdFrom } : {}), ...(createdToExclusive ? { createdToExclusive } : {}),
    });
  }
}
