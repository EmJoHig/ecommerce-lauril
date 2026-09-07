"use client";

import { useActionState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import type { AdminRoleView } from "../application/admin-access-repository";
import { initialAdminActionState } from "@/shared/presentation/admin-action-state";
import { createAdminAction, setAdminStatusAction, updateAdminRolesAction } from "./admin-access-actions";

export function CreateAdminForm({ roles }: Readonly<{ roles: ReadonlyArray<AdminRoleView> }>) {
  const [state, action] = useActionState(createAdminAction, initialAdminActionState);
  return <form action={action} className="admin-form admin-form--compact"><div className="form-grid"><label>Nombre<input maxLength={100} name="firstName" required /></label><label>Apellido<input maxLength={100} name="lastName" required /></label><label>Email<input maxLength={320} name="email" required type="email" /></label><label>Contraseña inicial<input maxLength={72} minLength={12} name="password" required type="password" /></label></div><fieldset><legend>Roles</legend><div className="checkbox-grid">{roles.map((role) => <label key={role.id}><input name="roleIds" type="checkbox" value={role.id} />{role.name}</label>)}</div></fieldset><SubmitButton>Crear administrador</SubmitButton><Feedback state={state} /></form>;
}

export function AdminRolesForm({ userId, assignedRoleIds, roles }: Readonly<{ userId: string; assignedRoleIds: ReadonlyArray<string>; roles: ReadonlyArray<AdminRoleView> }>) {
  const [state, action] = useActionState(updateAdminRolesAction, initialAdminActionState);
  return <form action={action} className="admin-role-form"><input name="userId" type="hidden" value={userId} /><div className="checkbox-grid">{roles.map((role) => <label key={role.id}><input defaultChecked={assignedRoleIds.includes(role.id)} name="roleIds" type="checkbox" value={role.id} />{role.name}</label>)}</div><SubmitButton>Guardar roles</SubmitButton><Feedback state={state} /></form>;
}

export function AdminStatusForm({ userId, status }: Readonly<{ userId: string; status: "ACTIVE" | "INVITED" | "DISABLED" }>) {
  const [state, action] = useActionState(setAdminStatusAction, initialAdminActionState);
  function confirm(event: FormEvent<HTMLFormElement>) {
    if (status === "ACTIVE" && !window.confirm("Se revocarán las sesiones de este administrador. ¿Querés continuar?")) event.preventDefault();
  }
  return <form action={action} className="inline-action" onSubmit={confirm}><input name="userId" type="hidden" value={userId} /><input name="status" type="hidden" value={status === "ACTIVE" ? "DISABLED" : "ACTIVE"} /><SubmitButton danger={status === "ACTIVE"}>{status === "ACTIVE" ? "Deshabilitar" : "Activar"}</SubmitButton><Feedback state={state} /></form>;
}

function SubmitButton({ children, danger = false }: Readonly<{ children: React.ReactNode; danger?: boolean }>) {
  const { pending } = useFormStatus();
  return <button className={danger ? "button button--danger button--small" : "button button--dark button--small"} disabled={pending} type="submit">{pending ? "Guardando…" : children}</button>;
}
function Feedback({ state }: Readonly<{ state: typeof initialAdminActionState }>) { return state.message ? <small className={state.status === "error" ? "action-error" : "action-success"}>{state.message}</small> : null; }
