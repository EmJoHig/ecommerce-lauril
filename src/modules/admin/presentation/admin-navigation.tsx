"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { label: "Inicio", items: [{ name: "Resumen", href: "/admin", permission: "admin.access" }] },
  { label: "Catálogo", items: [{ name: "Productos", href: "/admin/productos", permission: "catalog.read" }, { name: "Categorías", href: "/admin/categorias", permission: "catalog.read" }] },
  { label: "Inventario", items: [{ name: "Stock", href: "/admin/stock", permission: "inventory.read" }, { name: "Movimientos", href: "/admin/stock/movimientos", permission: "inventory.read" }] },
  { label: "Ventas", items: [{ name: "Pedidos", href: "/admin/pedidos", permission: "orders.read" }] },
  { label: "Clientes", items: [{ name: "Clientes", href: "/admin/clientes", permission: "customers.read" }] },
  { label: "Envíos", items: [{ name: "Métodos de entrega", href: "/admin/envios", permission: "shipping.read" }] },
  { label: "Administración", items: [{ name: "Configuración", href: "/admin/configuracion", permission: "admin.access" }, { name: "Administradores", href: "/admin/administradores", permission: "users.read" }, { name: "Roles y permisos", href: "/admin/roles", permission: "roles.read" }, { name: "Auditoría", href: "/admin/auditoria", permission: "audit.read" }] },
] as const;

export function AdminNavigation({ permissions, mobile = false }: Readonly<{ permissions: ReadonlyArray<string>; mobile?: boolean }>) {
  const pathname = usePathname();
  const visible = sections.map((section) => ({ ...section, items: section.items.filter((item) => permissions.includes(item.permission)) })).filter((section) => section.items.length);
  if (mobile) return <nav className="admin-mobile-nav" aria-label="Administración móvil">{visible.flatMap((section) => section.items).map((item) => <Link aria-current={isActive(pathname, item.href) ? "page" : undefined} className={isActive(pathname, item.href) ? "is-active" : undefined} href={item.href} key={item.href}>{item.name}</Link>)}</nav>;
  return (
    <nav aria-label="Administración">
      {visible.map((section) => <div className="admin-nav-section" key={section.label}><p>{section.label}</p>{section.items.map((item) => <Link aria-current={isActive(pathname, item.href) ? "page" : undefined} className={isActive(pathname, item.href) ? "is-active" : undefined} href={item.href} key={item.href}>{item.name}</Link>)}</div>)}
    </nav>
  );
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).slice(1);
  if (!parts.length) return null;
  const crumbs = parts.map((part, index) => ({ part, href: `/admin/${parts.slice(0, index + 1).join("/")}`, last: index === parts.length - 1 }));
  return <nav className="admin-breadcrumbs" aria-label="Ruta actual"><Link href="/admin">Inicio</Link>{crumbs.map(({ part, href, last }) => <span key={href}><span aria-hidden="true">/</span>{last ? <strong>{label(part)}</strong> : <Link href={href}>{label(part)}</Link>}</span>)}</nav>;
}

function isActive(pathname: string, href: string): boolean { return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }
function label(value: string): string { return /^[0-9a-f-]{30,}$/i.test(value) ? "Detalle" : value.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase()); }
