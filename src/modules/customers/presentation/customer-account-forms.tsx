"use client";

import { useActionState } from "react";
import type { CustomerAddressRecord } from "../application/customer-repository";
import { saveCustomerAddressAction, updateCustomerProfileAction } from "./customer-actions";
import { initialCustomerActionState } from "./customer-action-state";

function Feedback({ status, message }: { status: string; message: string }) {
  if (status === "idle") return null;
  return <div className={status === "error" ? "form-error" : "form-success"} role="status">{message}</div>;
}

export function CustomerProfileForm({ customer }: { customer: { firstName: string; lastName: string; phone: string; document: string | null; email: string } }) {
  const [state, action, pending] = useActionState(updateCustomerProfileAction, initialCustomerActionState);
  return (
    <form action={action} className="customer-form account-card">
      <Feedback message={state.message} status={state.status} />
      <div className="form-grid form-grid--two">
        <label>Nombre<input defaultValue={customer.firstName} name="firstName" required /></label>
        <label>Apellido<input defaultValue={customer.lastName} name="lastName" required /></label>
      </div>
      <label>Email<input disabled value={customer.email} /></label>
      <p className="form-help">El email permanece inmutable en esta fase para evitar cambios de identidad sin verificación.</p>
      <div className="form-grid form-grid--two">
        <label>Teléfono<input defaultValue={customer.phone} name="phone" required type="tel" /></label>
        <label>Documento opcional<input defaultValue={customer.document ?? ""} name="document" /></label>
      </div>
      <button className="button button--primary" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  );
}

export function CustomerAddressForm({ address }: { address?: CustomerAddressRecord }) {
  const [state, action, pending] = useActionState(saveCustomerAddressAction, initialCustomerActionState);
  return (
    <form action={action} className="customer-form account-card" id={address ? `editar-${address.id}` : "nueva-direccion"}>
      {address ? <input name="addressId" type="hidden" value={address.id} /> : null}
      <h2>{address ? `Editar ${address.label}` : "Agregar dirección"}</h2>
      <Feedback message={state.message} status={state.status} />
      <label>Nombre identificatorio<input defaultValue={address?.label ?? ""} name="label" placeholder="Casa" required /></label>
      <div className="form-grid form-grid--two">
        <label>Nombre del receptor<input defaultValue={address?.recipientFirstName ?? ""} name="recipientFirstName" required /></label>
        <label>Apellido del receptor<input defaultValue={address?.recipientLastName ?? ""} name="recipientLastName" required /></label>
      </div>
      <label>Teléfono<input defaultValue={address?.phone ?? ""} name="phone" required type="tel" /></label>
      <div className="form-grid form-grid--street">
        <label>Calle<input defaultValue={address?.street ?? ""} name="street" required /></label>
        <label>Número<input defaultValue={address?.streetNumber ?? ""} name="streetNumber" required /></label>
      </div>
      <label>Piso / departamento<input defaultValue={address?.floorApartment ?? ""} name="floorApartment" /></label>
      <div className="form-grid form-grid--two">
        <label>Localidad<input defaultValue={address?.city ?? ""} name="city" required /></label>
        <label>Provincia<input defaultValue={address?.province ?? ""} name="province" required /></label>
      </div>
      <label>Código postal<input defaultValue={address?.postalCode ?? ""} name="postalCode" required /></label>
      <label>Referencias opcionales<textarea defaultValue={address?.references ?? ""} name="references" rows={3} /></label>
      <label className="check-row"><input defaultChecked={address?.isDefault ?? false} name="isDefault" type="checkbox" /> Usar como dirección predeterminada</label>
      <button className="button button--primary" disabled={pending} type="submit">{pending ? "Guardando…" : address ? "Guardar dirección" : "Agregar dirección"}</button>
    </form>
  );
}
