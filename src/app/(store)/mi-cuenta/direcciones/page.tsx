import { getCustomerService } from "@/modules/customers/infrastructure/customer-composition";
import { CustomerAddressForm } from "@/modules/customers/presentation/customer-account-forms";
import { defaultCustomerAddressAction, deleteCustomerAddressAction } from "@/modules/customers/presentation/customer-actions";
import { requireCustomer } from "@/modules/customers/presentation/customer-session";

export default async function CustomerAddressesPage() {
  const customer = await requireCustomer();
  const addresses = await getCustomerService().listAddresses(customer.id);
  return (
    <div><div className="account-section-heading"><h2>Direcciones</h2><p>Estas direcciones todavía no calculan ni cotizan envíos.</p></div>
      <div className="address-list">{addresses.map((address) => <article className="address-card" key={address.id}><div><span>{address.isDefault ? "Predeterminada" : address.label}</span><h3>{address.label}</h3><p>{address.recipientFirstName} {address.recipientLastName}</p><p>{address.street} {address.streetNumber}{address.floorApartment ? ` · ${address.floorApartment}` : ""}</p><p>{address.city}, {address.province} · CP {address.postalCode}</p></div><div className="address-card__actions">{!address.isDefault ? <form action={defaultCustomerAddressAction}><input name="addressId" type="hidden" value={address.id} /><button type="submit">Hacer predeterminada</button></form> : null}<a href={`#editar-${address.id}`}>Editar</a><form action={deleteCustomerAddressAction}><input name="addressId" type="hidden" value={address.id} /><button type="submit">Eliminar</button></form></div></article>)}</div>
      {addresses.map((address) => <CustomerAddressForm address={address} key={address.id} />)}
      <CustomerAddressForm />
    </div>
  );
}
