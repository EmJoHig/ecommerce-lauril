import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const metadata: Metadata = { title: "Cambios y devoluciones" };

export default async function ReturnsPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section"><p className="eyebrow">Ayuda con tu compra</p><h1>Cambios y devoluciones</h1>
    <section><h2>Arrepentimiento de compra</h2><p>Si compraste a distancia, podés solicitar la revocación dentro de los 10 días corridos desde la entrega del producto o la celebración del contrato, lo que ocurra último, según la Ley 24.240. Usá el <Link href="/arrepentimiento">Botón de arrepentimiento</Link> sin necesidad de iniciar sesión. Te daremos un código de solicitud y nos comunicaremos para coordinar los pasos siguientes. Los gastos de devolución por este derecho están a cargo del vendedor, conforme a la ley.</p></section>
    <section><h2>Otros cambios o problemas con el producto</h2><p>Si recibiste un producto distinto, dañado o tenés otra consulta, escribí a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a> con tu número de pedido y una descripción del problema. Revisaremos el caso y te indicaremos cómo continuar, sin limitar las garantías legales que correspondan.</p></section>
    <section><h2>Reembolsos</h2><p>Una solicitud recibida no ejecuta un reembolso automático. Primero se verifica la compra y se coordina la devolución cuando corresponde. La confirmación del reembolso depende del medio de pago y se comunica por los canales de atención.</p></section>
  </article>;
}
