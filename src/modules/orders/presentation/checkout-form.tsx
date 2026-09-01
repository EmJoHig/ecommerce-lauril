"use client";

import { useActionState, useMemo, useState } from "react";
import { PendingButton } from "@/modules/catalog/presentation/pending-button";
import { confirmCheckoutAction } from "./checkout-actions";
import { initialCheckoutActionState } from "./checkout-action-state";

type Quote = {
  methodId: string;
  name: string;
  description: string | null;
  type: string;
  amount: string;
  total: string;
  requiresAddress: boolean;
};

type Address = {
  id: string;
  label: string;
  summary: string;
  isDefault: boolean;
};

export function CheckoutForm({
  checkoutKey,
  authenticatedBuyer,
  addresses,
  quotes,
  items,
  itemsSubtotal,
}: Readonly<{
  checkoutKey: string;
  authenticatedBuyer: { name: string; email: string; phone: string } | null;
  addresses: Address[];
  quotes: Quote[];
  items: Array<{ sku: string; productName: string; variantName: string; quantity: number; unitPrice: string; subtotal: string }>;
  itemsSubtotal: string;
}>) {
  const [state, action] = useActionState(confirmCheckoutAction, initialCheckoutActionState);
  const [methodId, setMethodId] = useState(quotes[0]?.methodId ?? "");
  const [addressMode, setAddressMode] = useState(addresses.length > 0 ? "saved" : "new");
  const quote = useMemo(() => quotes.find((item) => item.methodId === methodId) ?? quotes[0], [methodId, quotes]);

  return (
    <form action={action} className="checkout-layout">
      <input name="checkoutKey" type="hidden" value={checkoutKey} />
      {state.status === "error" ? <div className="form-error checkout-error" role="alert">{state.message}</div> : null}
      <div className="checkout-sections">
        <section className="checkout-card">
          <p className="eyebrow">1 · Comprador</p>
          <h2>Datos de contacto</h2>
          {authenticatedBuyer ? (
            <div className="checkout-buyer"><strong>{authenticatedBuyer.name}</strong><span>{authenticatedBuyer.email}</span><span>{authenticatedBuyer.phone}</span></div>
          ) : (
            <div className="form-grid form-grid--two">
              <Field error={state.fieldErrors?.firstName} label="Nombre"><input autoComplete="given-name" name="firstName" /></Field>
              <Field error={state.fieldErrors?.lastName} label="Apellido"><input autoComplete="family-name" name="lastName" /></Field>
              <Field error={state.fieldErrors?.email} label="Email"><input autoComplete="email" name="email" type="email" /></Field>
              <Field error={state.fieldErrors?.phone} label="Teléfono"><input autoComplete="tel" name="phone" /></Field>
            </div>
          )}
        </section>

        <section className="checkout-card">
          <p className="eyebrow">2 · Entrega</p>
          <h2>Elegí cómo recibirlo</h2>
          {quotes.length === 0 ? <div className="form-error">No hay métodos de entrega disponibles para este carrito.</div> : (
            <div className="checkout-options">
              {quotes.map((item) => <label className="checkout-option" key={item.methodId}>
                <input checked={methodId === item.methodId} name="shippingMethodId" onChange={() => setMethodId(item.methodId)} type="radio" value={item.methodId} />
                <span><strong>{item.name}</strong><small>{item.description ?? item.type.replaceAll("_", " ")}</small></span>
                <strong>{item.amount}</strong>
              </label>)}
            </div>
          )}
        </section>

        {quote?.requiresAddress ? <section className="checkout-card">
          <p className="eyebrow">3 · Dirección</p><h2>Datos de entrega</h2>
          {addresses.length > 0 ? <div className="address-mode">
            <label><input checked={addressMode === "saved"} name="addressMode" onChange={() => setAddressMode("saved")} type="radio" value="saved" /> Usar dirección guardada</label>
            <label><input checked={addressMode === "new"} name="addressMode" onChange={() => setAddressMode("new")} type="radio" value="new" /> Cargar otra dirección</label>
          </div> : <input name="addressMode" type="hidden" value="new" />}
          {addressMode === "saved" && addresses.length > 0 ? <label className="form-field">Dirección
            <select defaultValue={addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id} name="savedAddressId">
              {addresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.summary}</option>)}
            </select>
          </label> : <AddressFields errors={state.fieldErrors} />}
        </section> : null}
      </div>

      <aside className="cart-summary checkout-summary">
        <p className="eyebrow">4 · Resumen</p>
        {items.map((item) => <div className="checkout-summary__item" key={item.sku}>
          <span><strong>{item.productName}</strong><small>{item.variantName} · {item.quantity} × {item.unitPrice}</small></span><strong>{item.subtotal}</strong>
        </div>)}
        <div><span>Subtotal</span><strong>{itemsSubtotal}</strong></div>
        <div><span>Entrega</span><strong>{quote?.amount ?? "—"}</strong></div>
        <div className="cart-summary__total"><span>Total</span><strong>{quote?.total ?? itemsSubtotal}</strong></div>
        <p>El servidor volverá a validar precios, disponibilidad y stock antes de crear el pedido.</p>
        <PendingButton className="button button--primary button--wide">Confirmar pedido</PendingButton>
      </aside>
    </form>
  );
}

function AddressFields({ errors }: { errors: Readonly<Record<string, string>> | undefined }) {
  return <div className="form-grid form-grid--two">
    <Field error={errors?.recipientFirstName} label="Nombre del receptor"><input autoComplete="given-name" name="recipientFirstName" /></Field>
    <Field error={errors?.recipientLastName} label="Apellido del receptor"><input autoComplete="family-name" name="recipientLastName" /></Field>
    <Field error={errors?.shippingPhone} label="Teléfono"><input autoComplete="tel" name="shippingPhone" /></Field>
    <Field error={errors?.street} label="Calle"><input autoComplete="address-line1" name="street" /></Field>
    <Field error={errors?.streetNumber} label="Número"><input name="streetNumber" /></Field>
    <Field error={errors?.floorApartment} label="Piso / departamento"><input autoComplete="address-line2" name="floorApartment" /></Field>
    <Field error={errors?.city} label="Localidad"><input autoComplete="address-level2" name="city" /></Field>
    <Field error={errors?.province} label="Provincia"><input autoComplete="address-level1" name="province" /></Field>
    <Field error={errors?.postalCode} label="Código postal"><input autoComplete="postal-code" name="postalCode" /></Field>
    <Field error={errors?.references} label="Referencias"><textarea maxLength={500} name="references" rows={3} /></Field>
  </div>;
}

function Field({ label, error, children }: { label: string; error: string | undefined; children: React.ReactNode }) {
  return <label className="form-field">{label}{children}{error ? <small className="field-error">{error}</small> : null}</label>;
}
