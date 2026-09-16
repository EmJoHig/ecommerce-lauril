"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ConflictError, UnauthorizedError } from "@/shared/domain/errors";
import { getServerEnv } from "@/shared/infrastructure/env";
import { logger } from "@/shared/infrastructure/logger";
import { assertRateLimit } from "@/shared/infrastructure/rate-limit";
import { resolveRequestIp } from "@/shared/infrastructure/request-ip";
import { getAuthService } from "../infrastructure/auth-composition";

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
});

export async function loginAction(formData: FormData): Promise<never> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/admin/login?error=invalid-input");
  }

  const env = getServerEnv();
  const requestHeaders = await headers();
  const ipAddress = resolveRequestIp(requestHeaders);
  const email = parsed.data.email.trim().toLowerCase();
  let session;
  try {
    assertRateLimit({
      scope: "admin-login:ip",
      identity: ipAddress ?? "unknown",
      limit: 30,
      windowMs: 15 * 60_000,
    });
    assertRateLimit({
      scope: "admin-login:identity",
      identity: email,
      limit: 8,
      windowMs: 15 * 60_000,
    });
    session = await getAuthService().login({
      email,
      password: parsed.data.password,
      ipAddress,
      userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
      ttlDays: env.SESSION_TTL_DAYS,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      logger.warn("security.authentication_failed", { surface: "admin" });
      redirect("/admin/login?error=invalid-credentials");
    }
    if (error instanceof ConflictError) {
      redirect("/admin/login?error=invalid-credentials");
    }
    throw error;
  }

  (await cookies()).set(env.SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<never> {
  const env = getServerEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (token) {
    await getAuthService().logout(token);
    logger.info("security.logout", { surface: "admin" });
  }

  cookieStore.delete(env.SESSION_COOKIE_NAME);
  redirect("/admin/login");
}
