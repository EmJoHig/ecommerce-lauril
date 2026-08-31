import Link from "next/link";
import { logoutAction } from "@/modules/auth/presentation/auth-actions";
import { requireAdmin } from "@/modules/auth/presentation/session";

const navigation = [
  { label: "General", items: [{ name: "Dashboard", href: "/admin" }] },
  { label: "Ventas", items: [{ name: "Pedidos" }, { name: "Pagos" }, { name: "Envíos" }, { name: "Reembolsos" }] },
  { label: "Productos", items: [{ name: "Productos", href: "/admin/productos" }, { name: "Stock", href: "/admin/stock" }, { name: "Categorías" }, { name: "Movimientos" }] },
  { label: "Relaciones", items: [{ name: "Clientes" }, { name: "Marketing" }] },
  { label: "Tienda", items: [{ name: "Diseño" }, { name: "Reportes" }, { name: "Configuración" }] },
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand brand--light" href="/admin"><span className="brand__mark">L</span><span>Lauril</span></Link>
        <nav aria-label="Administración">
          {navigation.map((section) => (
            <div className="admin-nav-section" key={section.label}>
              <p>{section.label}</p>
              {section.items.map((item) => item.href ? (
                <Link href={item.href} key={item.name}>{item.name}</Link>
              ) : (
                <span className="admin-nav-disabled" key={item.name}>{item.name}<small>próx.</small></span>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div><span className="status-dot" /> Sistema operativo</div>
          <div className="admin-user"><span><strong>{user.name}</strong><small>{user.email}</small></span><form action={logoutAction}><button type="submit">Salir</button></form></div>
        </header>
        <nav className="admin-mobile-nav" aria-label="Administración móvil">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/productos">Productos</Link>
          <Link href="/admin/stock">Stock</Link>
        </nav>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
