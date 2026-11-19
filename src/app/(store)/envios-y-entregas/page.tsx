import type { Metadata } from "next";
import { getPublicShippingMethods } from "@/modules/shipping/infrastructure/shipping-composition";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Envíos y entregas" };

export default async function ShippingInformationPage() {
  const [settings, methods] = await Promise.all([getPublicStoreSettings(), getPublicShippingMethods()]);
  return <article className="legal-page section"><p className="eyebrow">Tu pedido</p><h1>Envíos y entregas</h1>
    <section><h2>Opciones disponibles</h2><p>Las modalidades habilitadas actualmente se muestran abajo. La disponibilidad para tu compra, su costo y el total del pedido se confirman en el checkout antes de finalizar. Algunas modalidades pueden requerir una dirección de entrega.</p>{methods.length > 0 ? <ul>{methods.map((method) => <li key={method.id}><strong>{method.name}</strong>{method.description ? `: ${method.description}` : null}</li>)}</ul> : null}</section>
    <section><h2>Coordinación</h2><p>La modalidad elegida queda registrada en el pedido. Si necesitás coordinar la entrega, consultar su estado o corregir un dato, escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a> con el número de pedido. Consultá el detalle de cada modalidad durante la compra.</p></section>
    {settings.businessAddress ? <section><h2>Dirección comercial</h2><p>{settings.businessAddress}. Consultá antes de acercarte si tu pedido permite retiro.</p></section> : null}
  </article>;
}
