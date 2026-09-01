import "server-only";

import { cookies } from "next/headers";
import { hashGuestCartToken, isGuestCartToken } from "@/modules/cart/domain/guest-cart-token";
import { getServerEnv } from "@/shared/infrastructure/env";

function cookieName(orderNumber: string): string {
  if (!/^\d{5,20}$/.test(orderNumber)) throw new Error("Número de pedido inválido.");
  return `lauril_order_${orderNumber}`;
}

export async function setGuestOrderCookie(orderNumber: string, token: string): Promise<void> {
  if (!isGuestCartToken(token)) throw new Error("Token de acceso al pedido inválido.");
  const env = getServerEnv();
  (await cookies()).set(cookieName(orderNumber), token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/pedido/${orderNumber}`,
    maxAge: 30 * 24 * 60 * 60,
    priority: "high",
  });
}

export async function getGuestOrderTokenHash(orderNumber: string): Promise<string | null> {
  const token = (await cookies()).get(cookieName(orderNumber))?.value;
  return token && isGuestCartToken(token) ? hashGuestCartToken(token) : null;
}
