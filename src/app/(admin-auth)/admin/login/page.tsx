import { redirect } from "next/navigation";
import { loginAction } from "@/modules/auth/presentation/auth-actions";
import { getCurrentUser } from "@/modules/auth/presentation/session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-aside">
        <div className="brand brand--light"><span className="brand__mark">L</span><span>Lauril</span></div>
        <div><p className="eyebrow">Administración</p><h1>Todo tu negocio,<br />en un solo lugar.</h1><p>Catálogo, inventario y operación con una base preparada para crecer.</p></div>
        <small>Fase 1 · Fundación operativa</small>
      </section>
      <section className="login-form-wrap">
        <form action={loginAction} className="login-form">
          <p className="eyebrow">Acceso seguro</p>
          <h2>Ingresá al panel</h2>
          <p>Usá la cuenta administrativa creada mediante el seed.</p>
          {error ? <div className="form-error" role="alert">Los datos ingresados no son válidos.</div> : null}
          <label>Email<input autoComplete="email" name="email" placeholder="admin@empresa.com" required type="email" /></label>
          <label>Contraseña<input autoComplete="current-password" minLength={12} name="password" required type="password" /></label>
          <button className="button button--primary button--wide" type="submit">Ingresar</button>
          <small>La sesión usa una cookie HttpOnly y el token se guarda hasheado.</small>
        </form>
      </section>
    </main>
  );
}
