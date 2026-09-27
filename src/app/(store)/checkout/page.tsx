import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { createCheckoutKey } from "@/modules/orders/domain/checkout-key";
import { getCheckoutService } from "@/modules/orders/infrastructure/order-composition";
import { CheckoutForm } from "@/modules/orders/presentation/checkout-form";
import { DomainError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ carrito?: string | string[] }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?returnTo=/checkout");
  let preparation;
  let errorMessage: string | null = null;
  try {
    preparation = await getCheckoutService().prepare({ kind: "customer", customerId: customer.id });
  } catch (error) {
    errorMessage = error instanceof DomainError ? error.message : "No se pudo preparar el checkout.";
  }
  if (!preparation) return unavailable(errorMessage ?? "No se pudo preparar el checkout.");
  const { carrito } = await searchParams;
  return <section className="checkout-page section">
      {carrito === "fusionado" ? <div className="form-success">Tu carrito invitado se fusionó con tu cuenta.</div> : null}
      {typeof carrito === "string" && carrito.startsWith("ajustado-") ? <div className="cart-warning">Fusionamos el carrito y ajustamos artículos según disponibilidad actual.</div> : null}
      <div className="cart-heading"><p className="eyebrow">Compra segura</p><h1>Checkout</h1><p>Confirmá tus datos y el método de entrega.</p></div>
      <CheckoutForm
        addresses={preparation.addresses.map((address) => ({ id: address.id, label: address.label, summary: `${address.street} ${address.streetNumber}, ${address.city}`, isDefault: address.isDefault }))}
        authenticatedBuyer={preparation.buyer}
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
