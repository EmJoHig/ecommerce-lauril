import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { getGuestCartTokenHash } from "@/modules/cart/presentation/guest-cart-cookie";
import { createCheckoutKey } from "@/modules/orders/domain/checkout-key";
import { getCheckoutService } from "@/modules/orders/infrastructure/order-composition";
import { CheckoutForm } from "@/modules/orders/presentation/checkout-form";
import { DomainError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  const guestTokenHash = customer ? null : await getGuestCartTokenHash();
  if (!customer && !guestTokenHash) return unavailable("No se encontró un carrito activo.");
  let preparation;
  let errorMessage: string | null = null;
  try {
    preparation = await getCheckoutService().prepare(customer
      ? { kind: "customer", customerId: customer.id }
      : { kind: "guest", tokenHash: guestTokenHash! });
  } catch (error) {
    errorMessage = error instanceof DomainError ? error.message : "No se pudo preparar el checkout.";
  }
  if (!preparation) return unavailable(errorMessage ?? "No se pudo preparar el checkout.");
  return <section className="checkout-page section">
      <div className="cart-heading"><p className="eyebrow">Compra segura</p><h1>Checkout</h1><p>Confirmá tus datos y el método de entrega.</p></div>
      <CheckoutForm
        addresses={preparation.addresses.map((address) => ({ id: address.id, label: address.label, summary: `${address.street} ${address.streetNumber}, ${address.city}`, isDefault: address.isDefault }))}
        authenticatedBuyer={preparation.buyer ? { name: `${preparation.buyer.firstName} ${preparation.buyer.lastName}`, email: preparation.buyer.email, phone: preparation.buyer.phone } : null}
        checkoutKey={createCheckoutKey()}
        items={preparation.items.map((item) => ({ sku: item.sku, productName: item.productName, variantName: item.variantName, quantity: item.quantity, unitPrice: formatMoney(item.unitPriceInCents), subtotal: formatMoney(item.subtotalInCents) }))}
        itemsSubtotal={formatMoney(preparation.itemsSubtotalInCents)}
        quotes={preparation.shippingQuotes.map((quote) => ({ methodId: quote.methodId, name: quote.name, description: quote.description, type: quote.type, requiresAddress: quote.requiresAddress, amount: formatMoney(quote.amountInCents), total: formatMoney(quote.totalInCents) }))}
      />
    </section>;
}

function unavailable(message: string) {
  return <section className="cart-page section"><div className="cart-heading"><p className="eyebrow">Checkout</p><h1>No se puede continuar</h1><p>{message}</p><Link className="button button--dark" href="/carrito">Volver al carrito</Link></div></section>;
}
