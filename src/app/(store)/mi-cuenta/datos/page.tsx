import { getCustomerService } from "@/modules/customers/infrastructure/customer-composition";
import { CustomerProfileForm } from "@/modules/customers/presentation/customer-account-forms";
import { requireCustomer } from "@/modules/customers/presentation/customer-session";

export default async function CustomerDataPage() {
  const session = await requireCustomer();
  const customer = await getCustomerService().getProfile(session.id);
  return <div><div className="account-section-heading"><h2>Datos personales</h2><p>Mantené actualizados tus datos de contacto.</p></div><CustomerProfileForm customer={customer} /></div>;
}
