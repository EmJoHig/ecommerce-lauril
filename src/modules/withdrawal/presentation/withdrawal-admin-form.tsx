"use client";
import { useActionState } from "react";
import { manageWithdrawal } from "./withdrawal-admin-actions";
import { withdrawalLabels, type WithdrawalStatus } from "../domain/withdrawal-admin";
export function WithdrawalAdminForm({ id, version, status }: { id: string; version: number; status: WithdrawalStatus }) {
  const [state, action, pending] = useActionState(manageWithdrawal, { message: "", success: false });
  return <form action={action} className="admin-form"><input name="id" type="hidden" value={id} /><input name="version" type="hidden" value={version} />
    <label className="form-field">Estado<select name="status" defaultValue={status}>{([...(status === "PENDING" ? ["PENDING"] : []), "IN_PROGRESS", "RESOLVED"] as WithdrawalStatus[]).map((value) => <option key={value} value={value}>{withdrawalLabels[value]}</option>)}</select></label>
    <label className="form-field">Actuación o resolución (obligatoria al resolver)<textarea name="content" required maxLength={2000} rows={5} /></label>
    <p>No incluyas documentos de identidad, datos bancarios, credenciales ni secretos. Podés registrar la referencia de una devolución ya efectuada. Resolver no ejecuta pagos ni cancela pedidos.</p>
    {state.message ? <p role="status" className={state.success ? "form-success" : "form-error"}>{state.message}</p> : null}
    <button className="button button--primary" disabled={pending}>Registrar actuación</button>{state.success ? <a href={`/admin/arrepentimientos/${id}`}>Recargar solicitud</a> : null}
  </form>;
}
