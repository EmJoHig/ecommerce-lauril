import type { PrismaClient } from "@/generated/prisma/client";

export async function syncWithdrawalPermissions(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    const access = await tx.permission.findUniqueOrThrow({ where: { code: "admin.access" } });
    const admin = await tx.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    const role = await tx.role.upsert({ where: { code: "WITHDRAWAL_OPERATOR" }, update: {}, create: { code: "WITHDRAWAL_OPERATOR", name: "Gestión de arrepentimientos" } });
    const expected = [access.id];
    for (const [code, name] of [["withdrawals.read", "Consultar arrepentimientos"], ["withdrawals.write", "Gestionar arrepentimientos"]] as const) {
      const permission = await tx.permission.upsert({ where: { code }, update: { name }, create: { code, name } });
      expected.push(permission.id);
      await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: admin.id, permissionId: permission.id } }, update: {}, create: { roleId: admin.id, permissionId: permission.id } });
    }
    // No ampliar ni limpiar silenciosamente un rol existente con permisos adicionales.
    const unexpected = await tx.rolePermission.count({ where: { roleId: role.id, permissionId: { notIn: expected } } });
    if (unexpected) throw new Error("WITHDRAWAL_OPERATOR contiene permisos adicionales; revisar antes de sincronizar.");
    for (const permissionId of expected) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId } }, update: {}, create: { roleId: role.id, permissionId } });
  });
}
