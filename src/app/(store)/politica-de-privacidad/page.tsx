import type { Metadata } from "next";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Política de privacidad" };

export default async function PrivacyPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section"><p className="eyebrow">Información legal</p><h1>Política de privacidad</h1>
    <section><h2>Responsable y contacto</h2><p>El responsable del tratamiento es el titular fiscal de Lauril, identificado en la página de información comercial. Para consultas sobre tus datos, escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>.</p>{settings.sellerName && settings.sellerFiscalAddress ? <p>{settings.sellerName}. Domicilio: {settings.sellerFiscalAddress}.</p> : null}</section>
    <section><h2>Datos y finalidades</h2><p>Al registrarte y comprar tratamos datos de cuenta, autenticación, contacto, pedidos y domicilios de entrega para gestionar la compra, el pago, la entrega, la facturación y las comunicaciones transaccionales. También tratamos consultas y reclamos. Las solicitudes de arrepentimiento guardan nombre, email, fecha y código; el número de pedido se guarda si lo proporcionás. No solicitamos datos de tarjetas en el sitio.</p></section>
    <section><h2>Pagos y proveedores</h2><p>Mercado Pago procesa el pago; la tienda conserva identificadores, estados y datos necesarios para pedidos y reembolsos. Para operar usamos alojamiento, MongoDB Atlas y servicios de correo transaccional como Resend. Estos proveedores acceden únicamente a los datos necesarios para prestar sus servicios. No enviamos mensajes promocionales por defecto.</p></section>
    <section><h2>Cookies y medición</h2><p>Usamos cookies necesarias para sesiones, carrito y acceso a pedidos históricos de invitados. El código actual de la tienda no incorpora herramientas de medición o publicidad de terceros. Si se incorporan en el futuro, esta política deberá actualizarse antes de usarlas.</p></section>
    <section><h2>Seguridad y conservación</h2><p>Aplicamos controles de acceso y medidas técnicas para proteger la información. Conservamos los datos mientras sean necesarios para gestionar compras, atender reclamos y cumplir obligaciones legales; las solicitudes de arrepentimiento se revisan manualmente. No existe eliminación automática de esas solicitudes.</p></section>
    <section><h2>Tus derechos</h2><p>Podés solicitar acceso, rectificación, actualización o supresión de tus datos de acuerdo con la Ley 25.326. Escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>; podremos pedir una verificación razonable de identidad antes de divulgar o modificar datos. También podés acudir a la Agencia de Acceso a la Información Pública, autoridad de control en Argentina.</p></section>
  </article>;
}
