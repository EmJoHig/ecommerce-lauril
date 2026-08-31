"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UnauthorizedError } from "@/shared/domain/errors";
import { getServerEnv } from "@/shared/infrastructure/env";
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
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  let session;
  try {
    session = await getAuthService().login({
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress: forwardedFor ?? null,
      userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
      ttlDays: env.SESSION_TTL_DAYS,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
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
  }

  cookieStore.delete(env.SESSION_COOKIE_NAME);
  redirect("/admin/login");
}
