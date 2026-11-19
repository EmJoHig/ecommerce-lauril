import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";
import { WithdrawalForm } from "./form";

export const metadata: Metadata = { title: "Botón de arrepentimiento", robots: { index: true, follow: true } };

export default async function WithdrawalPage() {
  const settings = await getPublicStoreSettings();
  return <article className="legal-page section"><p className="eyebrow">Derechos del consumidor</p><h1>Botón de arrepentimiento</h1>
    <p>Podés solicitar la revocación de una compra realizada a distancia sin iniciar sesión. Completá los datos mínimos para identificar tu pedido. Al enviarlos recibirás en esta página un código de registro de inmediato. Guardalo como constancia.</p>
    <p>La solicitud no cancela el pedido ni genera un reembolso automático. Nos comunicaremos con vos para verificar la compra y coordinar lo que corresponda. Si no encontrás el número de pedido, escribinos a <a href={`mailto:${settings.publicEmail}`}>{settings.publicEmail}</a>.</p>
    <WithdrawalForm requestKey={randomUUID()} />
  </article>;
}
