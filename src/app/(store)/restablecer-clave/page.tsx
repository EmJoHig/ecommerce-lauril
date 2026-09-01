import type { Metadata } from "next";
import { PasswordResetForm } from "@/modules/customers/presentation/customer-auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <section className="customer-auth-page section customer-auth-page--compact">
      <div className="customer-auth-copy"><p className="eyebrow">Acceso seguro</p><h1>Elegí una nueva contraseña</h1><p>El enlace vence y puede utilizarse una sola vez.</p></div>
      <PasswordResetForm />
    </section>
  );
}
