import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Información comercial" };

export default async function CommercialInformationPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section">
    <p className="eyebrow">Información de la tienda</p><h1>Información comercial</h1>
    <section><h2>Quiénes somos</h2><p>{settings.storeName} es el nombre comercial de esta tienda. Para consultas sobre una compra, escribinos por los canales indicados abajo.</p></section>
    <section><h2>Atención y contacto</h2><p>Correo: <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>.</p>{settings.phone ? <p>Teléfono: <a href={`tel:${settings.phone}`}>{settings.phone}</a>.</p> : null}{settings.whatsapp ? <p>WhatsApp: <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>{settings.whatsapp}</a>.</p> : null}{settings.businessAddress ? <p>Dirección comercial: {settings.businessAddress}.</p> : null}</section>
    <section><h2>Pagos</h2><p>El pago en línea se inicia mediante Mercado Pago Checkout Pro. Los medios disponibles y sus condiciones se muestran en Mercado Pago antes de confirmar la operación. El pedido se considera pagado cuando recibimos su confirmación.</p></section>
    <section><h2>Entregas</h2><p>Las opciones habilitadas para tu compra, su costo y el total del pedido se muestran en el checkout antes de confirmar. Consultá también <Link href="/envios-y-entregas">envíos y entregas</Link>.</p></section>
    <section><h2>Facturación y comprobantes</h2><p>El comprobante fiscal correspondiente se emite por el sistema de facturación autorizado del comercio. Si necesitás informar datos para facturar o consultar el comprobante, escribinos con tu número de pedido. La confirmación del pedido y el comprobante de Mercado Pago no reemplazan una factura fiscal.</p></section>
  </article>;
}
