import { describe, expect, it, vi } from "vitest";
import { AdminAccessService } from "@/modules/auth/application/admin-access-service";
import type { AdminAccessRepository } from "@/modules/auth/application/admin-access-repository";
import { CustomerAdminService } from "@/modules/customers/application/customer-admin-service";
import type { CustomerAdminRepository } from "@/modules/customers/application/customer-admin-repository";
import { InventoryAdminService } from "@/modules/inventory/application/inventory-admin-service";
import type { InventoryAdminRepository } from "@/modules/inventory/application/inventory-admin-repository";
import { AuditService, sanitizeAuditMetadata } from "@/modules/audit/application/audit-service";
import type { AuditRepository } from "@/modules/audit/application/audit-repository";
import { boundedPageSize, businessDate, normalizedSearch, positivePage } from "@/shared/application/admin-list-query";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";

const customerId = "70000000-0000-4000-8000-000000000001";
const actorId = "70000000-0000-4000-8000-000000000002";
const roleId = "70000000-0000-4000-8000-000000000003";

function customerRepository(): CustomerAdminRepository {
  return {
    list: vi.fn(async (query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 })),
    find: vi.fn(async () => null),
    updateProfile: vi.fn(async () => null),
    setStatus: vi.fn(async () => null),
    addNote: vi.fn(async () => null),
  };
}

function adminRepository(grantsAccess = true): AdminAccessRepository {
  return {
    listAdmins: vi.fn(async () => []), listRoles: vi.fn(async () => []),
    rolesGrantAdminAccess: vi.fn(async () => grantsAccess), createAdmin: vi.fn(async () => ({ id: actorId })),
    setStatus: vi.fn(async () => undefined), updateRoles: vi.fn(async () => undefined),
  };
}

describe("fase 7: consolidación del backoffice", () => {
  it("normaliza y limita parámetros administrativos compartidos", () => {
    expect(positivePage(-2)).toBe(1);
    expect(boundedPageSize(500)).toBe(100);
    expect(normalizedSearch("  Ana   Pérez  ")).toBe("Ana Pérez");
    expect(businessDate("2026-09-01")?.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(() => businessDate("2026-02-31")).toThrow(ValidationError);
  });

  it("normaliza búsqueda, filtros y paginación del listado de clientes", async () => {
    const repository = customerRepository();
    await new CustomerAdminService(repository).list({ page: 0, pageSize: 300, search: "  Laura  ", status: "ACTIVE", orderPresence: "with-orders", sort: "name-asc" });
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100, search: "Laura", status: "ACTIVE", orderPresence: "with-orders", sort: "name-asc" }));
  });

  it("informa correctamente un cliente inexistente", async () => {
    await expect(new CustomerAdminService(customerRepository()).find(customerId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("normaliza datos editables y notas privadas antes de persistirlos", async () => {
    const repository = customerRepository();
    repository.updateProfile = vi.fn(async () => ({ id: customerId }) as never);
    repository.addNote = vi.fn(async () => ({ id: customerId }) as never);
    const service = new CustomerAdminService(repository);
    await service.updateProfile({ customerId, actorUserId: actorId, firstName: "  Ana María ", lastName: " Pérez ", phone: "+54 11 5555-5555", document: " 30111222 " });
    await service.addNote({ customerId, actorUserId: actorId, content: "  Prefiere contacto telefónico.  " });
    expect(repository.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Ana María", lastName: "Pérez", document: "30111222" }));
    expect(repository.addNote).toHaveBeenCalledWith(expect.objectContaining({ content: "Prefiere contacto telefónico." }));
  });

  it("valida y delega el estado administrativo del cliente", async () => {
    const repository = customerRepository();
    repository.setStatus = vi.fn(async () => ({ id: customerId }) as never);
    await new CustomerAdminService(repository).setStatus({ customerId, actorUserId: actorId, status: "DISABLED" });
    expect(repository.setStatus).toHaveBeenCalledWith(expect.objectContaining({ customerId, actorUserId: actorId, status: "DISABLED" }));
  });

  it("impide que un administrador deshabilite su propia cuenta", async () => {
    await expect(new AdminAccessService(adminRepository()).setStatus({ userId: actorId, actorUserId: actorId, status: "DISABLED" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("impide asignar roles que no conceden acceso administrativo", async () => {
    await expect(new AdminAccessService(adminRepository(false)).updateRoles({ userId: customerId, actorUserId: actorId, roleIds: [roleId] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("elimina metadatos sensibles del registro de auditoría incluso si están anidados", async () => {
    const metadata = sanitizeAuditMetadata({ status: "DISABLED", token: "oculto", nested: { cookieValue: "oculto", reason: "solicitud" }, rows: [{ passwordHash: "oculto", id: 1 }] });
    expect(metadata).toEqual({ status: "DISABLED", nested: { reason: "solicitud" }, rows: [{ id: 1 }] });
    const repository: AuditRepository = { list: vi.fn(async (query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 })), listFacets: vi.fn(async () => ({ actions: [], entityTypes: [] })) };
    await new AuditService(repository).list({ search: "  producto  ", pageSize: 999 });
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ search: "producto", pageSize: 100 }));
  });

  it("aplica búsqueda, bajo stock y orden al inventario administrativo", async () => {
    const listInventory = vi.fn(async (query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 }));
    const repository = { listInventory, listMovements: vi.fn() } as unknown as InventoryAdminRepository;
    await new InventoryAdminService(repository).listInventory({ search: "  SKU-01 ", lowStock: "true", sort: "stock-asc" });
    expect(listInventory).toHaveBeenCalledWith(expect.objectContaining({ search: "SKU-01", lowStockOnly: true, sort: "stock-asc" }));
  });

  it("normaliza filtros de movimientos y rechaza fechas manipuladas", async () => {
    const listMovements = vi.fn(async (query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 1 }));
    const repository = { listInventory: vi.fn(), listMovements } as unknown as InventoryAdminRepository;
    const service = new InventoryAdminService(repository);
    await service.listMovements({ type: "ADJUSTMENT", createdFrom: "2026-09-01", createdTo: "2026-09-02" });
    expect(listMovements).toHaveBeenCalledWith(expect.objectContaining({ type: "ADJUSTMENT", createdFrom: new Date("2026-09-01T03:00:00.000Z"), createdToExclusive: new Date("2026-09-03T03:00:00.000Z") }));
    expect(() => service.listMovements({ createdFrom: "ayer" })).toThrow(ValidationError);
  });
});
