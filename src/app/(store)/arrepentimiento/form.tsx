"use client";

import { useActionState } from "react";
import { submitWithdrawalRequest, type WithdrawalActionState } from "./action";

const initialState: WithdrawalActionState = { status: "idle", message: "" };

export function WithdrawalForm({ requestKey }: Readonly<{ requestKey: string }>) {
  const [state, action, pending] = useActionState(submitWithdrawalRequest, initialState);
  return <form action={action} className="legal-form">
    <input name="requestKey" type="hidden" value={requestKey} />
    <label>Número de pedido<input autoComplete="off" inputMode="numeric" maxLength={18} name="orderNumber" required /></label>
    <label>Nombre completo<input autoComplete="name" maxLength={100} name="name" required /></label>
    <label>Email usado en la compra<input autoComplete="email" maxLength={160} name="email" required type="email" /></label>
    <input aria-hidden="true" autoComplete="off" className="contact-dialog__honeypot" name="website" tabIndex={-1} />
    {state.message ? <p className={state.status === "success" ? "form-success" : "form-error"} role="status">{state.message}{state.code ? <> Código de solicitud: <strong>{state.code}</strong>.</> : null}</p> : null}
    <button className="button button--primary" disabled={pending || state.status === "success"} type="submit">{pending ? "Registrando…" : "Enviar solicitud"}</button>
  </form>;
}
