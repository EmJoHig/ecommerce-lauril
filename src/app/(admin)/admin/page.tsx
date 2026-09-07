import Link from "next/link";
import { getAdminOverviewService } from "@/modules/admin/infrastructure/admin-overview-composition";
import { requireAdmin } from "@/modules/auth/presentation/session";

export const dynamic = "force-dynamic";

const shortcuts = [
  { href: "/admin/productos", title: "Productos", description: "Publicación, variantes, imágenes y precios." },
  { href: "/admin/pedidos", title: "Pedidos", description: "Preparación, entrega, historial y notas." },
  { href: "/admin/clientes", title: "Clientes", description: "Perfiles, direcciones, pedidos y notas privadas." },
  { href: "/admin/stock", title: "Stock", description: "Disponibilidad, reservas y ajustes trazables." },
] as const;

export default async function AdminDashboardPage() {
  await requireAdmin("admin.access");
  const overview = await getAdminOverviewService().getOverview();
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Inicio</p><h1>Operación de la tienda</h1><p>Accesos y contadores esenciales del backoffice.</p></div></div>
    <section className="metric-grid metric-grid--five"><article><span>Pedidos pendientes</span><strong>{overview.pendingOrders}</strong><small>requieren pago o cancelación</small></article><article><span>En preparación</span><strong>{overview.preparingOrders}</strong><small>incluye listos para entregar</small></article><article><span>Productos activos</span><strong>{overview.activeProducts}</strong><small>visibles en la tienda</small></article><article><span>Stock bajo</span><strong>{overview.lowStockVariants}</strong><small>variantes en mínimo</small></article><article><span>Clientes</span><strong>{overview.registeredCustomers}</strong><small>perfiles registrados</small></article></section>
    <section className="admin-shortcut-grid">{shortcuts.map((item) => <Link className="admin-panel admin-shortcut" href={item.href} key={item.href}><span>Ir a</span><h2>{item.title}</h2><p>{item.description}</p><strong>Abrir →</strong></Link>)}</section>
  </>;
}
