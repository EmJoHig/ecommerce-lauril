"use client";

import { useActionState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { OrderStatusValue } from "../domain/order";
import { addOrderNoteAction, requestPaymentRefundAction, transitionOrderAction } from "./order-admin-actions";
import { initialOrderAdminActionState } from "./order-admin-action-state";

export function OrderTransitionForm({
  orderId,
  toStatus,
  label,
  critical = false,
}: Readonly<{
  orderId: string;
  toStatus: OrderStatusValue;
  label: string;
  critical?: boolean;
}>) {
  const [state, action] = useActionState(transitionOrderAction, initialOrderAdminActionState);
  function confirmTransition(event: FormEvent<HTMLFormElement>) {
    if (critical && !window.confirm("Esta acción cancelará el pedido y liberará su reserva. ¿Querés continuar?")) {
      event.preventDefault();
    }
  }
  return (
    <form action={action} className="order-action-form" onSubmit={confirmTransition}>
      <input name="orderId" type="hidden" value={orderId} />
      <input name="toStatus" type="hidden" value={toStatus} />
      <label>
        Motivo o referencia (opcional)
        <input maxLength={500} name="reason" placeholder="Ej.: despachado por correo interno" />
      </label>
      <SubmitButton critical={critical}>{label}</SubmitButton>
      {state.message ? <p className={state.status === "error" ? "action-error" : "action-success"} role="status">{state.message}</p> : null}
    </form>
  );
}

export function OrderNoteForm({ orderId }: Readonly<{ orderId: string }>) {
  const [state, action] = useActionState(addOrderNoteAction, initialOrderAdminActionState);
  return (
    <form action={action} className="order-note-form">
      <input name="orderId" type="hidden" value={orderId} />
      <label>
        Nueva nota interna
        <textarea maxLength={2000} name="content" placeholder="Información operativa visible solo para administradores" required rows={4} />
      </label>
      <SubmitButton>Agregar nota</SubmitButton>
      {state.message ? <p className={state.status === "error" ? "action-error" : "action-success"} role="status">{state.message}</p> : null}
    </form>
  );
}

export function OrderRefundForms({ orderId, remainingInCents }: Readonly<{ orderId: string; remainingInCents: bigint }>) {
  const [fullState, fullAction] = useActionState(requestPaymentRefundAction, initialOrderAdminActionState);
  const [partialState, partialAction] = useActionState(requestPaymentRefundAction, initialOrderAdminActionState);
  const remaining = `${remainingInCents / 100n},${(remainingInCents % 100n).toString().padStart(2, "0")}`;
  return <div className="order-refund-forms">
    <form action={fullAction} className="order-action-form">
      <input name="orderId" type="hidden" value={orderId} />
      <input name="kind" type="hidden" value="FULL" />
      <SubmitButton critical>Reembolso total</SubmitButton>
      {fullState.message ? <p className={fullState.status === "error" ? "action-error" : "action-success"} role="status">{fullState.message}</p> : null}
    </form>
    <form action={partialAction} className="order-action-form">
      <input name="orderId" type="hidden" value={orderId} />
      <input name="kind" type="hidden" value="PARTIAL" />
      <label>Importe parcial (máximo {remaining})<input inputMode="decimal" name="amount" placeholder="0,00" required /></label>
      <SubmitButton>Reembolso parcial</SubmitButton>
      {partialState.message ? <p className={partialState.status === "error" ? "action-error" : "action-success"} role="status">{partialState.message}</p> : null}
    </form>
  </div>;
}

function SubmitButton({ children, critical = false }: Readonly<{ children: ReactNode; critical?: boolean }>) {
  const { pending } = useFormStatus();
  return <button className={critical ? "button button--danger" : "button button--dark"} disabled={pending} type="submit">{pending ? "Guardando…" : children}</button>;
}
