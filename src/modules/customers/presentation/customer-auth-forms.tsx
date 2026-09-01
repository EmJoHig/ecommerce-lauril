"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import {
  loginCustomerAction,
  registerCustomerAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "./customer-actions";
import { initialCustomerActionState } from "./customer-action-state";

function Feedback({ state }: { state: typeof initialCustomerActionState }) {
  if (state.status === "idle") return null;
  return <div className={state.status === "error" ? "form-error" : "form-success"} role="status">{state.message}</div>;
}

function ErrorFor({ state, field }: { state: typeof initialCustomerActionState; field: string }) {
  const error = state.fieldErrors?.[field];
  return error ? <small className="field-error">{error}</small> : null;
}

export function CustomerRegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAction, initialCustomerActionState);
  return (
    <form action={action} className="customer-form">
      <Feedback state={state} />
      <div className="form-grid form-grid--two">
        <label>Nombre<input autoComplete="given-name" name="firstName" required /><ErrorFor field="firstName" state={state} /></label>
        <label>Apellido<input autoComplete="family-name" name="lastName" required /><ErrorFor field="lastName" state={state} /></label>
      </div>
      <label>Email<input autoComplete="email" name="email" required type="email" /><ErrorFor field="email" state={state} /></label>
      <label>Teléfono<input autoComplete="tel" name="phone" required type="tel" /><ErrorFor field="phone" state={state} /></label>
      <div className="form-grid form-grid--two">
        <label>Contraseña<input autoComplete="new-password" minLength={12} name="password" required type="password" /><ErrorFor field="password" state={state} /></label>
        <label>Repetir contraseña<input autoComplete="new-password" minLength={12} name="passwordConfirmation" required type="password" /><ErrorFor field="passwordConfirmation" state={state} /></label>
      </div>
      <p className="form-help">Usá al menos 12 caracteres. Nunca guardamos la contraseña en texto plano.</p>
      <button className="button button--primary button--wide" disabled={pending} type="submit">{pending ? "Creando cuenta…" : "Crear cuenta"}</button>
      <p className="form-switch">¿Ya tenés cuenta? <Link href="/login">Ingresá</Link></p>
    </form>
  );
}

export function CustomerLoginForm({ resetCompleted = false, loggedOut = false }: { resetCompleted?: boolean; loggedOut?: boolean }) {
  const [state, action, pending] = useActionState(loginCustomerAction, initialCustomerActionState);
  return (
    <form action={action} className="customer-form">
      {resetCompleted ? <div className="form-success">Tu contraseña fue actualizada. Ya podés ingresar.</div> : null}
      {loggedOut ? <div className="form-success">Cerraste sesión correctamente.</div> : null}
      <Feedback state={state} />
      <label>Email<input autoComplete="email" name="email" required type="email" /></label>
      <label>Contraseña<input autoComplete="current-password" name="password" required type="password" /></label>
      <div className="form-row-between"><Link href="/recuperar-clave">Olvidé mi contraseña</Link></div>
      <button className="button button--primary button--wide" disabled={pending} type="submit">{pending ? "Ingresando…" : "Ingresar"}</button>
      <p className="form-switch">¿No tenés cuenta? <Link href="/registro">Creala ahora</Link></p>
    </form>
  );
}

export function PasswordRecoveryForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialCustomerActionState);
  return (
    <form action={action} className="customer-form">
      <Feedback state={state} />
      <label>Email<input autoComplete="email" name="email" required type="email" /></label>
      <button className="button button--primary button--wide" disabled={pending} type="submit">{pending ? "Preparando…" : "Recuperar contraseña"}</button>
      {state.developmentPreviewUrl ? <a className="development-reset-link" href={state.developmentPreviewUrl}>Abrir enlace de recuperación (solo desarrollo)</a> : null}
      <p className="form-switch"><Link href="/login">Volver al ingreso</Link></p>
    </form>
  );
}

export function PasswordResetForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initialCustomerActionState);
  const locationHash = useSyncExternalStore(
    subscribeToLocationHash,
    readLocationHash,
    emptyLocationHash,
  );
  const candidate = new URLSearchParams(locationHash.slice(1)).get("token") ?? "";
  const token = /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : "";
  return (
    <form action={action} className="customer-form">
      <input name="token" readOnly type="hidden" value={token} />
      <Feedback state={state} />
      {!token ? <div className="form-error">El enlace es inválido o no contiene un token.</div> : null}
      <label>Nueva contraseña<input autoComplete="new-password" minLength={12} name="password" required type="password" /></label>
      <label>Repetir contraseña<input autoComplete="new-password" minLength={12} name="passwordConfirmation" required type="password" /></label>
      <button className="button button--primary button--wide" disabled={pending || !token} type="submit">{pending ? "Actualizando…" : "Guardar contraseña"}</button>
    </form>
  );
}

function subscribeToLocationHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function readLocationHash(): string {
  return window.location.hash;
}

function emptyLocationHash(): string {
  return "";
}
