"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PendingButton } from "@/modules/catalog/presentation/pending-button";
import { saveShippingMethodAction } from "./shipping-actions";
import { initialShippingActionState } from "./shipping-action-state";

type Model = {
  id?: string;
  code: string;
  name: string;
  description: string;
  type: "PICKUP" | "FLAT_RATE" | "LOCAL_DELIVERY" | "TO_COORDINATE";
  cost: string;
  requiresAddress: boolean;
  minimumSubtotal: string;
  freeShippingFrom: string;
  isActive: boolean;
  sortOrder: number;
};

export function ShippingForm({ initial }: Readonly<{ initial: Model }>) {
  const [state, action] = useActionState(saveShippingMethodAction, initialShippingActionState);
  const [type, setType] = useState(initial.type);
  const canConfigureAddress = type === "FLAT_RATE";
  return <form action={action} className="admin-form">
    {initial.id ? <input name="id" type="hidden" value={initial.id} /> : null}
    {state.status === "error" ? <div className="form-error" role="alert">{state.message}</div> : null}
    <section className="admin-panel form-section"><div className="form-grid form-grid--two">
      <label className="form-field">Nombre<input defaultValue={initial.name} maxLength={120} name="name" required /></label>
      <label className="form-field">Código<input defaultValue={initial.code} maxLength={80} name="code" required /></label>
      <label className="form-field form-field--wide">Descripción<textarea defaultValue={initial.description} maxLength={500} name="description" rows={4} /></label>
      <label className="form-field">Tipo<select defaultValue={initial.type} name="type" onChange={(event) => setType(event.target.value as Model["type"])}><option value="PICKUP">Retiro en local</option><option value="FLAT_RATE">Tarifa fija</option><option value="LOCAL_DELIVERY">Envío local</option><option value="TO_COORDINATE">A coordinar</option></select></label>
      <label className="form-field">Costo en ARS<input defaultValue={initial.cost} inputMode="decimal" name="cost" required /></label>
      <label className="form-field">Compra mínima en ARS<input defaultValue={initial.minimumSubtotal} inputMode="decimal" name="minimumSubtotal" /></label>
      <label className="form-field">Gratis desde ARS<input defaultValue={initial.freeShippingFrom} inputMode="decimal" name="freeShippingFrom" /></label>
      <label className="form-field">Orden<input defaultValue={initial.sortOrder} min={0} name="sortOrder" type="number" /></label>
      {canConfigureAddress ? <label className="check-field"><input defaultChecked={initial.requiresAddress} name="requiresAddress" type="checkbox" /> Requiere dirección</label> : null}
      <label className="check-field"><input defaultChecked={initial.isActive} name="isActive" type="checkbox" /> Método activo</label>
    </div></section>
    <div className="sticky-actions"><Link className="button button--secondary" href="/admin/envios">Cancelar</Link><PendingButton>{initial.id ? "Guardar método" : "Crear método"}</PendingButton></div>
  </form>;
}
