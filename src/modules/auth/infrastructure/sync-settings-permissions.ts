import type { PrismaClient } from "@/generated/prisma/client";

const settingsPermissions = [
  ["settings.read", "Consultar configuración de la tienda"],
  ["settings.write", "Gestionar configuración de la tienda"],
] as const;

export async function syncSettingsPermissions(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.role.findUnique({
    where: { code: "ADMIN" },
    select: { id: true, permissions: { where: { permission: { code: "admin.access" } }, select: { id: true } } },
  });
  if (!admin || admin.permissions.length === 0) {
    throw new Error("El rol ADMIN debe existir y conservar admin.access antes de sincronizar settings.*.");
  }

  await prisma.$transaction(async (tx) => {
    for (const [code, name] of settingsPermissions) {
      const permission = await tx.permission.upsert({
        where: { code },
        update: { name },
        create: { code, name },
      });
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: admin.id, permissionId: permission.id } },
        update: {},
        create: { roleId: admin.id, permissionId: permission.id },
      });
    }
  });
}
