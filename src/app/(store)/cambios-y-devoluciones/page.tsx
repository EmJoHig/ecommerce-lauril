import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Cambios y devoluciones" };

export default async function ReturnsPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section"><p className="eyebrow">Ayuda con tu compra</p><h1>Cambios y devoluciones</h1>
    <section><h2>Arrepentimiento de compra</h2><p>Si compraste a distancia, podés solicitar la revocación dentro de los 10 días corridos desde la entrega del producto o la celebración del contrato, lo que ocurra último, según la Ley 24.240. Usá el <Link href="/arrepentimiento">Botón de arrepentimiento</Link> sin necesidad de iniciar sesión. Te daremos un código de solicitud y nos comunicaremos para coordinar los pasos siguientes. Los gastos de devolución por este derecho están a cargo del vendedor, conforme a la ley.</p></section>
    <section><h2>Cambios voluntarios de fragancia</h2><p>Lauril permite solicitar cambios voluntarios de fragancia durante 15 días corridos para productos sin usar y en condiciones originales. Podés elegir otra fragancia; si hay diferencia de precio, se informa y acuerda antes del cambio. La gestión presencial en Tecnoclean — Punto de retiro Lauril no tiene costo adicional. Si solicitás traslados solo para un cambio voluntario, se acuerdan previamente. Escribinos a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a> para coordinar.</p></section>
    <section><h2>Problemas con el producto y garantías</h2><p>Si recibiste un producto distinto, dañado o tenés otra consulta, escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a> con tu número de pedido y una descripción del problema. Las condiciones de cambios voluntarios no limitan garantías, derechos por productos defectuosos ni el derecho de arrepentimiento.</p></section>
    <section><h2>Reembolsos</h2><p>Una solicitud recibida no ejecuta un reembolso automático. Primero se verifica la compra y se coordina la devolución cuando corresponde. Los pagos hechos con Mercado Pago se reembolsan mediante el procedimiento seguro del proveedor. La confirmación se comunica por los canales de atención.</p></section>
  </article>;
}
