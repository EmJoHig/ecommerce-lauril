import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerRegisterForm } from "@/modules/customers/presentation/customer-auth-forms";
import { getCurrentCustomer } from "@/modules/customers/presentation/customer-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false, follow: false } };

export default async function RegisterPage() {
  if (await getCurrentCustomer()) redirect("/mi-cuenta");
  return (
    <section className="customer-auth-page section">
      <div className="customer-auth-copy"><p className="eyebrow">Tu cuenta Lauril</p><h1>Creá tu cuenta</h1><p>Guardá tus datos, administrá direcciones y conservá el carrito entre visitas.</p></div>
      <CustomerRegisterForm />
    </section>
  );
}
