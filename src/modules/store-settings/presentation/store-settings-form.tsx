"use client";

import { useActionState } from "react";
import { PendingButton } from "@/modules/catalog/presentation/pending-button";
import type { StoreSettings } from "../domain/store-settings";
import { initialStoreSettingsActionState } from "./store-settings-action-state";
import { saveStoreSettingsAction } from "./store-settings-actions";

export function StoreSettingsForm({ settings, canWrite }: Readonly<{ settings: StoreSettings; canWrite: boolean }>) {
  const [state, action] = useActionState(saveStoreSettingsAction, initialStoreSettingsActionState);
  return <form action={canWrite ? action : undefined} className="admin-form">
    {state.status !== "idle" ? <div className={state.status === "success" ? "form-success" : "form-error"} role="status">{state.message}</div> : null}
    <section className="admin-panel form-section">
      <div className="panel-heading"><div><p className="eyebrow">Identidad</p><h2>Datos comerciales</h2></div></div>
      <div className="form-grid form-grid--two">
        <label className="form-field">Nombre de la tienda<input defaultValue={settings.storeName} maxLength={120} name="storeName" required readOnly={!canWrite} /></label>
        <label className="form-field">Email público<input defaultValue={settings.publicEmail} maxLength={320} name="publicEmail" required type="email" readOnly={!canWrite} /></label>
        <label className="form-field">Teléfono<input defaultValue={settings.phone ?? ""} maxLength={30} name="phone" readOnly={!canWrite} /></label>
        <label className="form-field">WhatsApp<input defaultValue={settings.whatsapp ?? ""} maxLength={30} name="whatsapp" readOnly={!canWrite} /></label>
        <label className="form-field form-field--wide">Dirección comercial<input defaultValue={settings.businessAddress ?? ""} maxLength={300} name="businessAddress" readOnly={!canWrite} /></label>
        <label className="form-field form-field--wide">Descripción pública breve<textarea defaultValue={settings.publicDescription ?? ""} maxLength={500} name="publicDescription" rows={4} readOnly={!canWrite} /></label>
      </div>
    </section>
    <section className="admin-panel form-section">
      <div className="panel-heading"><div><p className="eyebrow">Canales</p><h2>Redes sociales</h2></div></div>
      <div className="form-grid form-grid--two">
        <label className="form-field">URL de Instagram<input defaultValue={settings.instagramUrl ?? ""} maxLength={500} name="instagramUrl" placeholder="https://instagram.com/..." type="url" readOnly={!canWrite} /></label>
        <label className="form-field">URL de Facebook<input defaultValue={settings.facebookUrl ?? ""} maxLength={500} name="facebookUrl" placeholder="https://facebook.com/..." type="url" readOnly={!canWrite} /></label>
      </div>
    </section>
    {canWrite ? <div className="sticky-actions"><PendingButton>Guardar configuración</PendingButton></div> : null}
  </form>;
}
