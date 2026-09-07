import Link from "next/link";
import { logoutAction } from "@/modules/auth/presentation/auth-actions";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { AdminBreadcrumbs, AdminNavigation } from "@/modules/admin/presentation/admin-navigation";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link className="brand brand--light" href="/admin"><span className="brand__mark">L</span><span>Lauril</span></Link><AdminNavigation permissions={user.permissions} /></aside>
    <div className="admin-main">
      <header className="admin-topbar"><div><span className="status-dot" /> Backoffice operativo</div><div className="admin-user"><span><strong>{user.name}</strong><small>{user.email}</small></span><form action={logoutAction}><button type="submit">Salir</button></form></div></header>
      <div className="admin-mobile-nav-wrap"><AdminNavigation mobile permissions={user.permissions} /></div>
      <AdminBreadcrumbs />
      <main className="admin-content">{children}</main>
    </div>
  </div>;
}
