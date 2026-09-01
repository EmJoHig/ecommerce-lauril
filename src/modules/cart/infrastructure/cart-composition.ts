import "server-only";

import { getPrisma } from "@/shared/infrastructure/prisma";
import { getServerEnv } from "@/shared/infrastructure/env";
import { CartService } from "../application/cart-service";
import { PrismaCartRepository } from "./prisma-cart-repository";

export function getCartService(): CartService {
  return new CartService(
    new PrismaCartRepository(getPrisma()),
    getServerEnv().CART_TTL_DAYS,
  );
}
