import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { NotFoundError } from "@/shared/domain/errors";
import { getWithdrawalAdminService } from "@/modules/withdrawal/infrastructure/withdrawal-admin-composition";
import { withdrawalAge, withdrawalLabels } from "@/modules/withdrawal/domain/withdrawal-admin";
import { WithdrawalAdminForm } from "@/modules/withdrawal/presentation/withdrawal-admin-form";

export const dynamic = "force-dynamic";
export default async function WithdrawalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("admin.access");
  const actor = await requireAdmin("withdrawals.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const request = await getWithdrawalAdminService().find(id).catch((error) => { if (error instanceof NotFoundError) notFound(); throw error; });
  const date = (value: Date) => value.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Atención al consumidor</p><h1>Solicitud de arrepentimiento</h1><p style={{ overflowWrap: "anywhere" }}>{request.code}</p></div><Link href="/admin/arrepentimientos">Volver al listado</Link></div>
    <section className="admin-panel form-section"><h2>Recepción y contacto</h2><p>Estado: {withdrawalLabels[request.status]}</p><p>Recibida: {date(request.createdAt)} · {withdrawalAge(request.createdAt)}</p><p>Pedido declarado: {request.orderNumber?.toString() ?? "No informado"}. Verificar identidad y operación antes de actuar.</p><p>{request.name}</p><a style={{ overflowWrap: "anywhere" }} href={`mailto:${request.email}`}>{request.email}</a></section>
    {request.resolution ? <section className="admin-panel form-section"><h2>Resolución</h2><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.resolution}</p><p>{request.resolvedAt ? date(request.resolvedAt) : ""}</p></section> : null}
    <section className="admin-panel form-section"><h2>Actuaciones</h2>{request.activities.length ? request.activities.map((activity) => <article key={activity.id}><p><strong>{activity.actorName}</strong> · {date(activity.createdAt)} · {withdrawalLabels[activity.toStatus]}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{activity.content}</p></article>) : <p>Sin actuaciones registradas.</p>}</section>
    {actor.permissions.includes("withdrawals.write") && request.status !== "RESOLVED" ? <section className="admin-panel form-section"><h2>Registrar gestión</h2><WithdrawalAdminForm id={request.id} status={request.status} version={request.version} /></section> : null}
  </>;
}
