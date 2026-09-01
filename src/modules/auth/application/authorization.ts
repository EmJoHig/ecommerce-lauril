import { ForbiddenError } from "@/shared/domain/errors";

export function assertPermission(
  permissions: readonly string[],
  requiredPermission: string,
): void {
  if (!permissions.includes(requiredPermission)) {
    throw new ForbiddenError("No tenés permiso para realizar esta operación.");
  }
}
