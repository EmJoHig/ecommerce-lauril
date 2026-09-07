import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerLoginForm } from "@/modules/customers/presentation/customer-auth-forms";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ingresar", robots: { index: false, follow: false } };

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; logout?: string }> }) {
  if (await getCurrentCustomer()) redirect("/mi-cuenta");
  const [params, settings] = await Promise.all([searchParams, getPublicStoreSettings()]);
  return (
    <section className="customer-auth-page section customer-auth-page--compact">
      <div className="customer-auth-copy"><p className="eyebrow">Tu cuenta {settings.storeName}</p><h1>Qué bueno verte</h1><p>Ingresá para recuperar tu carrito y administrar tus datos.</p></div>
      <CustomerLoginForm loggedOut={params.logout === "1"} resetCompleted={params.reset === "success"} />
    </section>
  );
}
