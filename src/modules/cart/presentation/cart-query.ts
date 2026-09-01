import "server-only";

import { getCartService } from "../infrastructure/cart-composition";
import { getGuestCartTokenHash } from "./guest-cart-cookie";

export async function getRequestCart() {
  return getCartService().getCart(await getGuestCartTokenHash());
}
