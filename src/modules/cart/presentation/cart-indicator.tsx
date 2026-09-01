import Link from "next/link";
import { getRequestCart } from "./cart-query";

export async function CartIndicator() {
  const cart = await getRequestCart();
  return (
    <Link aria-label={`Carrito con ${cart.itemCount} unidades`} href="/carrito">
      Bolsa <span className="cart-count">{cart.itemCount}</span>
    </Link>
  );
}
