import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default async function TermsPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section"><p className="eyebrow">Información legal</p><h1>Términos y condiciones</h1>
    <section><h2>La tienda</h2><p>Este sitio muestra los productos ofrecidos bajo el nombre comercial {settings.storeName}. Podés hacer consultas por <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>.</p></section>
    <section><h2>Pedidos y precios</h2><p>Los productos, importes en pesos argentinos y opciones de entrega disponibles se muestran antes de confirmar el pedido. El servidor vuelve a comprobar precio, disponibilidad y costo de entrega al confirmar. Un pedido pendiente de pago no equivale a una venta pagada; la reserva de stock vence según el plazo indicado durante la compra.</p></section>
    <section><h2>Pago y entrega</h2><p>El pago en línea se procesa mediante Mercado Pago Checkout Pro. La aprobación del pago se confirma con la información recibida de Mercado Pago. Las condiciones concretas de entrega se muestran en el checkout y se conservan en el pedido. Encontrá más información en <Link href="/envios-y-entregas">envíos y entregas</Link>.</p></section>
    <section><h2>Derechos de la persona consumidora</h2><p>Podés solicitar la revocación de una compra a distancia dentro del plazo legal aplicable mediante el <Link href="/arrepentimiento">Botón de arrepentimiento</Link>, sin iniciar sesión. Consultá también <Link href="/cambios-y-devoluciones">cambios y devoluciones</Link>. Esta información no limita los derechos reconocidos por la Ley 24.240 y demás normas aplicables.</p></section>
    <section><h2>Comprobantes</h2><p>La confirmación del pedido y la constancia de pago no son facturas fiscales. Para solicitar o consultar el comprobante fiscal, escribinos e indicá el número de pedido.</p></section>
  </article>;
}
