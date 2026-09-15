import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { syncSettingsPermissions } from "@/modules/auth/infrastructure/sync-settings-permissions";

describe("syncSettingsPermissions", () => {
  it("es idempotente y vincula los permisos solamente a ADMIN", async () => {
    const permissionIds = new Map<string, string>();
    const links = new Set<string>();
    const permissionUpsert = vi.fn(async ({ where }: { where: { code: string } }) => {
      if (!permissionIds.has(where.code)) permissionIds.set(where.code, `id-${where.code}`);
      return { id: permissionIds.get(where.code) };
    });
    const rolePermissionUpsert = vi.fn(async ({ where }: { where: { roleId_permissionId: { roleId: string; permissionId: string } } }) => {
      links.add(`${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`);
    });
    const prisma = {
      role: { findUnique: vi.fn(async () => ({ id: "admin-role", permissions: [{ id: "admin-access-link" }] })) },
      $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({
        permission: { upsert: permissionUpsert }, rolePermission: { upsert: rolePermissionUpsert },
      }),
    } as unknown as PrismaClient;

    await syncSettingsPermissions(prisma);
    await syncSettingsPermissions(prisma);
    expect(permissionIds.size).toBe(2);
    expect(links).toEqual(new Set(["admin-role:id-settings.read", "admin-role:id-settings.write"]));
    expect(rolePermissionUpsert).toHaveBeenCalledTimes(4);
  });

  it("no escribe si ADMIN no conserva admin.access", async () => {
    const transaction = vi.fn();
    const prisma = { role: { findUnique: vi.fn(async () => ({ id: "admin-role", permissions: [] })) }, $transaction: transaction } as unknown as PrismaClient;
    await expect(syncSettingsPermissions(prisma)).rejects.toThrow("admin.access");
    expect(transaction).not.toHaveBeenCalled();
  });
});
