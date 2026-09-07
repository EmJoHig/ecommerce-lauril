import { z } from "zod";
import { ConflictError, ValidationError } from "@/shared/domain/errors";
import { hashPassword, validatePassword } from "../domain/password";
import type { AdminAccessRepository } from "./admin-access-repository";

export class AdminAccessService {
  constructor(private readonly repository: AdminAccessRepository, private readonly bcryptCost = 12) {}

  listAdmins() { return this.repository.listAdmins(); }
  listRoles() { return this.repository.listRoles(); }

  async create(input: Readonly<{
    email: string; password: string; firstName: string; lastName: string;
    roleIds: ReadonlyArray<string>; actorUserId: string;
  }>, now = new Date()) {
    const email = z.email().max(320).parse(input.email.trim().toLowerCase());
    validatePassword(input.password);
    const firstName = requiredName(input.firstName, "El nombre");
    const lastName = requiredName(input.lastName, "El apellido");
    const roleIds = uniqueIds(input.roleIds);
    if (!(await this.repository.rolesGrantAdminAccess(roleIds))) {
      throw new ValidationError("Seleccioná al menos un rol con acceso administrativo.");
    }
    return this.repository.createAdmin({
      email, passwordHash: await hashPassword(input.password, this.bcryptCost), firstName, lastName,
      roleIds, actorUserId: z.uuid().parse(input.actorUserId), occurredAt: now,
    });
  }

  async setStatus(input: Readonly<{ userId: string; status: "ACTIVE" | "DISABLED"; actorUserId: string }>, now = new Date()) {
    const userId = z.uuid().parse(input.userId);
    const actorUserId = z.uuid().parse(input.actorUserId);
    if (userId === actorUserId && input.status === "DISABLED") {
      throw new ConflictError("No podés deshabilitar tu propia cuenta administrativa.");
    }
    await this.repository.setStatus({ userId, actorUserId, status: z.enum(["ACTIVE", "DISABLED"]).parse(input.status), occurredAt: now });
  }

  async updateRoles(input: Readonly<{ userId: string; roleIds: ReadonlyArray<string>; actorUserId: string }>, now = new Date()) {
    const roleIds = uniqueIds(input.roleIds);
    if (!(await this.repository.rolesGrantAdminAccess(roleIds))) {
      throw new ValidationError("Un administrador debe conservar al menos un rol con admin.access.");
    }
    await this.repository.updateRoles({
      userId: z.uuid().parse(input.userId), actorUserId: z.uuid().parse(input.actorUserId), roleIds, occurredAt: now,
    });
  }
}

function requiredName(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 100) throw new ValidationError(`${label} es obligatorio.`);
  return normalized;
}

function uniqueIds(values: ReadonlyArray<string>): string[] {
  const parsed = values.map((value) => z.uuid().parse(value));
  return [...new Set(parsed)];
}
