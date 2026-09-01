import type { Metadata } from "next";
import { PasswordRecoveryForm } from "@/modules/customers/presentation/customer-auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false, follow: false } };

export default function RecoverPasswordPage() {
  return (
    <section className="customer-auth-page section customer-auth-page--compact">
      <div className="customer-auth-copy"><p className="eyebrow">Acceso seguro</p><h1>Recuperá tu contraseña</h1><p>Ingresá tu email. La respuesta será la misma exista o no una cuenta asociada.</p></div>
      <PasswordRecoveryForm />
    </section>
  );
}
