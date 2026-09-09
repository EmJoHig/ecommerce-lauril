import { formatMoney } from "@/shared/domain/money";
import { CartDrawer } from "./cart-drawer";
import { getRequestCart } from "./cart-query";

export async function CartIndicator() {
  const cart = await getRequestCart();
  return <CartDrawer cart={{
    itemCount: cart.itemCount,
    subtotal: formatMoney(cart.subtotalInCents),
    hasIssues: cart.hasIssues,
    items: cart.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productSlug: item.productSlug,
      productName: item.productName,
      variantName: item.variantName,
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
      quantity: item.quantity,
      availableStock: item.availableStock,
      unitPrice: formatMoney(item.unitPriceInCents),
      lineSubtotal: formatMoney(item.lineSubtotalInCents),
      availability: item.availability,
      availabilityMessage: item.availabilityMessage,
    })),
  }} />;
}
