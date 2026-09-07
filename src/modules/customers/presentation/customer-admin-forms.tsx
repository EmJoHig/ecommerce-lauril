"use client";

import { useActionState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { initialAdminActionState } from "@/shared/presentation/admin-action-state";
import { addCustomerNoteAction, setCustomerStatusAction, updateCustomerAdminAction } from "./customer-admin-actions";

export function CustomerAdminProfileForm(props: Readonly<{
  customerId: string; firstName: string; lastName: string; phone: string; document: string | null;
}>) {
  const [state, action] = useActionState(updateCustomerAdminAction, initialAdminActionState);
  return <form action={action} className="admin-form admin-form--compact">
    <input name="customerId" type="hidden" value={props.customerId} />
    <div className="form-grid"><label>Nombre<input defaultValue={props.firstName} maxLength={100} name="firstName" required /></label><label>Apellido<input defaultValue={props.lastName} maxLength={100} name="lastName" required /></label><label>Teléfono<input defaultValue={props.phone} maxLength={30} name="phone" required /></label><label>Documento<input defaultValue={props.document ?? ""} maxLength={50} name="document" /></label></div>
    <SubmitButton>Guardar datos</SubmitButton><Feedback state={state} />
  </form>;
}

export function CustomerStatusForm({ customerId, status }: Readonly<{ customerId: string; status: "ACTIVE" | "DISABLED" }>) {
  const [state, action] = useActionState(setCustomerStatusAction, initialAdminActionState);
  function confirm(event: FormEvent<HTMLFormElement>) {
    if (status === "ACTIVE" && !window.confirm("El cliente no podrá iniciar sesión. ¿Querés deshabilitarlo?")) event.preventDefault();
  }
  return <form action={action} className="inline-action" onSubmit={confirm}>
    <input name="customerId" type="hidden" value={customerId} /><input name="status" type="hidden" value={status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
    <SubmitButton danger={status === "ACTIVE"}>{status === "ACTIVE" ? "Deshabilitar cliente" : "Habilitar cliente"}</SubmitButton><Feedback state={state} />
  </form>;
}

export function CustomerNoteForm({ customerId }: Readonly<{ customerId: string }>) {
  const [state, action] = useActionState(addCustomerNoteAction, initialAdminActionState);
  return <form action={action} className="order-note-form">
    <input name="customerId" type="hidden" value={customerId} />
    <label>Nueva nota interna<textarea maxLength={2000} name="content" placeholder="Información privada para el equipo" required rows={4} /></label>
    <SubmitButton>Agregar nota</SubmitButton><Feedback state={state} />
  </form>;
}

function SubmitButton({ children, danger = false }: Readonly<{ children: React.ReactNode; danger?: boolean }>) {
  const { pending } = useFormStatus();
  return <button className={danger ? "button button--danger" : "button button--dark"} disabled={pending} type="submit">{pending ? "Guardando…" : children}</button>;
}

function Feedback({ state }: Readonly<{ state: typeof initialAdminActionState }>) {
  return state.message ? <p className={state.status === "error" ? "action-error" : "action-success"} role="status">{state.message}</p> : null;
}
