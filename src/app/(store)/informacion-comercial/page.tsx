import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Información comercial" };

export default async function CommercialInformationPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section">
    <p className="eyebrow">Información de la tienda</p><h1>Información comercial</h1>
    <section><h2>Quiénes somos</h2><p>{settings.storeName} es la marca de esta tienda. El vendedor es una persona humana monotributista, distinta del titular de Tecnoclean.</p>{settings.sellerName && settings.sellerCuit && settings.sellerFiscalAddress ? <p>Titular: {settings.sellerName}. CUIT: {settings.sellerCuit}. Domicilio fiscal: {settings.sellerFiscalAddress}.</p> : null}{settings.fiscalDataUrl ? <p><a href={settings.fiscalDataUrl} rel="noreferrer" target="_blank">Formulario 960/D — Data Fiscal</a></p> : null}</section>
    <section><h2>Atención y contacto</h2><p>Correo: <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>.</p>{settings.phone ? <p>Teléfono: <a href={`tel:${settings.phone}`}>{settings.phone}</a>.</p> : null}{settings.whatsapp ? <p>WhatsApp Business: <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}>{settings.whatsapp}</a>.</p> : null}<p>Atención de lunes a sábado, de 9:00 a 19:00. Primera respuesta comercial: hasta el siguiente día hábil de atención. Estos canales reciben consultas, pedidos, reclamos, cancelaciones y devoluciones.</p><p>Tecnoclean — Punto de retiro Lauril: Calle 68 N.º 1261, entre 20 y 21, La Plata, Buenos Aires. No es el domicilio fiscal del vendedor.</p></section>
    <section><h2>Pagos</h2><p>El pago en línea se inicia mediante Mercado Pago Checkout Pro. Los medios disponibles y sus condiciones se muestran en Mercado Pago antes de confirmar la operación. El pedido se considera pagado cuando recibimos su confirmación.</p></section>
    <section><h2>Entregas</h2><p>Las opciones habilitadas para tu compra, su costo y el total del pedido se muestran en el checkout antes de confirmar. Consultá también <Link href="/envios-y-entregas">envíos y entregas</Link>.</p></section>
    <section><h2>Facturación y comprobantes</h2><p>El vendedor emite manualmente una factura electrónica C mediante ARCA — Comprobantes en Línea y envía el PDF al correo del cliente. Para informar datos de facturación o consultar el comprobante, escribinos con tu número de pedido. La confirmación del pedido y el comprobante de Mercado Pago no reemplazan la factura fiscal. Cuando corresponde, se gestiona la nota de crédito.</p></section>
  </article>;
}
