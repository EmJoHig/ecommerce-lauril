import type { Metadata } from "next";
import { getPublicShippingMethods } from "@/modules/shipping/infrastructure/shipping-composition";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Envíos y entregas" };

export default async function ShippingInformationPage() {
  const [settings, methods] = await Promise.all([getPublicStoreSettings(), getPublicShippingMethods()]);
  return <article className="legal-page section"><p className="eyebrow">Tu pedido</p><h1>Envíos y entregas</h1>
    <section><h2>Opciones disponibles</h2><p>Realizamos entregas a domicilio únicamente en La Plata (ARS 2.500) y Berisso (ARS 3.500), provincia de Buenos Aires. El retiro presencial no tiene costo. Las opciones habilitadas y el total se confirman en checkout antes de finalizar; no ofrecemos envíos nacionales.</p>{methods.length > 0 ? <ul>{methods.map((method) => <li key={method.id}><strong>{method.name}</strong>{method.description ? `: ${method.description}` : null}</li>)}</ul> : null}</section>
    <section><h2>Preparación y entrega</h2><p>Para pagos con Mercado Pago, la preparación comienza desde la acreditación del pago y puede llevar hasta 2 días hábiles. Desde que el pedido está listo, la entrega a domicilio puede llevar hasta 1 día hábil adicional; si elegiste retiro, estará disponible dentro de 1 día hábil adicional. Te avisaremos cuándo podés retirarlo. Atendemos de lunes a sábado, de 9:00 a 19:00; domingos y feriados no cuentan como días hábiles de atención.</p></section>
    <section><h2>Coordinación</h2><p>El retiro se realiza en Tecnoclean — Punto de retiro Lauril, Calle 68 N.º 1261, entre 20 y 21, La Plata, de lunes a sábado de 9:00 a 19:00. Esperá nuestro aviso antes de acercarte. Para coordinar la entrega o consultar tu pedido, escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a> con el número de pedido. Tecnoclean no es el titular fiscal de Lauril.</p></section>
  </article>;
}
