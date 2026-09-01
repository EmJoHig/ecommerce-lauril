import "server-only";

import { cookies } from "next/headers";
import { getServerEnv } from "@/shared/infrastructure/env";
import {
  hashGuestCartToken,
  isGuestCartToken,
} from "../domain/guest-cart-token";

export async function getGuestCartToken(): Promise<string | null> {
  const env = getServerEnv();
  const token = (await cookies()).get(env.CART_COOKIE_NAME)?.value;
  return token && isGuestCartToken(token) ? token : null;
}

export async function getGuestCartTokenHash(): Promise<string | null> {
  const token = await getGuestCartToken();
  return token ? hashGuestCartToken(token) : null;
}

export async function setGuestCartCookie(token: string): Promise<void> {
  if (!isGuestCartToken(token)) throw new Error("Token de carrito inválido.");
  const env = getServerEnv();
  (await cookies()).set({
    name: env.CART_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: env.CART_TTL_DAYS * 24 * 60 * 60,
    priority: "high",
  });
}

export async function deleteGuestCartCookie(): Promise<void> {
  (await cookies()).delete(getServerEnv().CART_COOKIE_NAME);
}
