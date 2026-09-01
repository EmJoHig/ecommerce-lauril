import "server-only";

import { cookies } from "next/headers";
import { getServerEnv } from "@/shared/infrastructure/env";

export async function getCustomerSessionToken(): Promise<string | null> {
  const env = getServerEnv();
  return (await cookies()).get(env.CUSTOMER_SESSION_COOKIE_NAME)?.value ?? null;
}

export async function setCustomerSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const env = getServerEnv();
  (await cookies()).set(env.CUSTOMER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function deleteCustomerSessionCookie(): Promise<void> {
  (await cookies()).delete(getServerEnv().CUSTOMER_SESSION_COOKIE_NAME);
}
