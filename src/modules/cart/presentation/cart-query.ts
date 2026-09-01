import "server-only";

import { getCartService } from "../infrastructure/cart-composition";
import { getGuestCartTokenHash } from "./guest-cart-cookie";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";

export async function getRequestCart() {
  const customer = await getCurrentCustomer();
  return customer
    ? getCartService().getCustomerCart(customer.id)
    : getCartService().getCart(await getGuestCartTokenHash());
}
