import type { Metadata } from "next";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Política de privacidad" };

export default async function PrivacyPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section"><p className="eyebrow">Información legal</p><h1>Política de privacidad</h1>
    <section><h2>Datos que usamos</h2><p>Cuando creás una cuenta o comprás, tratamos los datos que ingresás para identificarte, gestionar el carrito y el pedido, coordinar la entrega, responder consultas y cumplir obligaciones legales. Las solicitudes de arrepentimiento guardan número de pedido, nombre, email, fecha y código de registro.</p></section>
    <section><h2>Pagos y proveedores</h2><p>El pago se realiza en Mercado Pago; esta tienda conserva los identificadores y estados necesarios para gestionar pedidos y reembolsos. Para operar el sitio también se utilizan proveedores de alojamiento, base de datos y correo. No publicamos tus datos personales ni los usamos para mensajes comerciales sin la base legal correspondiente.</p></section>
    <section><h2>Seguridad y conservación</h2><p>Aplicamos controles de acceso y medidas técnicas para proteger la información. Conservamos los datos durante el tiempo necesario para gestionar compras, atender reclamos y cumplir obligaciones legales.</p></section>
    <section><h2>Tus derechos</h2><p>Podés solicitar acceso, rectificación, actualización o supresión de tus datos de acuerdo con la Ley 25.326. Escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>; podremos pedir una verificación razonable de identidad para proteger tu información. También podés acudir a la Agencia de Acceso a la Información Pública, autoridad de control en Argentina.</p></section>
  </article>;
}
