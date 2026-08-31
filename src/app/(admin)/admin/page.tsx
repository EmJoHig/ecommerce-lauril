import Link from "next/link";
import { getAdminCatalogOverview, listInventoryRows } from "@/modules/catalog/infrastructure/admin-catalog-query";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [overview, inventory] = await Promise.all([getAdminCatalogOverview(), listInventoryRows()]);
  const lowStock = inventory.filter((row) => row.available <= row.minimumStock).slice(0, 5);

  return (
    <>
      <div className="admin-heading"><div><p className="eyebrow">Resumen</p><h1>Buen día.</h1><p>Esta es la base operativa de tu tienda.</p></div><Link className="button button--dark" href="/admin/productos">Ver catálogo</Link></div>
      <section className="metric-grid">
        <article><span>Productos</span><strong>{overview.productCount}</strong><small>{overview.activeProductCount} publicados</small></article>
        <article><span>Categorías</span><strong>{overview.categoryCount}</strong><small>colecciones activas</small></article>
        <article><span>Alertas de stock</span><strong>{overview.lowStockCount}</strong><small>en mínimo o por debajo</small></article>
        <article className="metric-card--muted"><span>Ventas del mes</span><strong>—</strong><small>Disponible con pedidos · Fase 3</small></article>
      </section>
      <section className="admin-panel">
        <div className="panel-heading"><div><p className="eyebrow">Inventario</p><h2>Productos con poco stock</h2></div><Link href="/admin/stock">Ver inventario →</Link></div>
        {lowStock.length ? (
          <div className="admin-list">{lowStock.map((row) => <div key={row.id}><span><strong>{row.productName}</strong><small>{row.sku} · {row.variantName}</small></span><span className="stock stock--out">{row.available} disponibles</span></div>)}</div>
        ) : <div className="empty-state empty-state--small"><p>No hay alertas de stock.</p></div>}
      </section>
    </>
  );
}
