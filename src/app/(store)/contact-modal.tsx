"use client";

import { useActionState, useId, useRef } from "react";
import { sendContactMessageAction, type ContactActionState } from "./contact-action";

const initialContactActionState: ContactActionState = { status: "idle", message: "" };

export function ContactModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, action, pending] = useActionState(sendContactMessageAction, initialContactActionState);

  return <>
    <button className="contact-trigger" onClick={() => dialogRef.current?.showModal()} type="button">Contacto</button>
    <dialog aria-labelledby={titleId} className="contact-dialog" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }} ref={dialogRef}>
      <header><h2 id={titleId}>Contacto</h2><button aria-label="Cerrar contacto" onClick={() => dialogRef.current?.close()} type="button">×</button></header>
      <form action={action}>
        <label>Nombre completo<input autoComplete="name" maxLength={100} name="name" required /></label>
        <div className="contact-dialog__row"><label>Email<input autoComplete="email" maxLength={160} name="email" required type="email" /></label><label>Teléfono (opcional)<input autoComplete="tel" maxLength={40} name="phone" type="tel" /></label></div>
        <label>Mensaje<textarea maxLength={2000} minLength={10} name="message" required rows={6} /></label>
        <input aria-hidden="true" autoComplete="off" className="contact-dialog__honeypot" name="website" tabIndex={-1} />
        {state.message ? <p className={`contact-dialog__status contact-dialog__status--${state.status}`} role="status">{state.message}</p> : null}
        <footer><button className="button button--primary" disabled={pending} type="submit">{pending ? "Enviando…" : "Enviar"}</button></footer>
      </form>
    </dialog>
  </>;
}
