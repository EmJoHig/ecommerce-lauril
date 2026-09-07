import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getServerEnv } from "@/shared/infrastructure/env";
import { ForbiddenError } from "@/shared/domain/errors";
import { assertPermission } from "../application/authorization";
import { getAuthService } from "../infrastructure/auth-composition";

export async function getCurrentUser() {
  const env = getServerEnv();
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return getAuthService().findSession(token);
}

export async function requireAdmin(permission = "admin.access") {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }

  try {
    assertPermission(user.permissions, permission);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return user;
}
