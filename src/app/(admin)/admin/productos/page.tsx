import Link from "next/link";
import { listAdminProducts } from "@/modules/catalog/infrastructure/admin-catalog-query";
import { formatMoney } from "@/shared/domain/money";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await listAdminProducts();
  return (
    <>
      <div className="admin-heading"><div><p className="eyebrow">Catálogo</p><h1>Productos</h1><p>Productos y variantes creados en la base.</p></div><button className="button button--dark" disabled type="button">Nuevo producto · Fase 2</button></div>
      <section className="admin-panel admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Producto</th><th>Estado</th><th>Variantes</th><th>Precio base</th><th>Stock disponible</th><th /></tr></thead>
          <tbody>{products.map((product) => {
            const base = product.variants[0];
            return <tr key={product.id}><td><strong>{product.name}</strong><small>{product.categoryNames.join(" · ") || "Sin categoría"}</small></td><td><span className={`status-badge status-badge--${product.status.toLowerCase()}`}>{product.status}</span></td><td>{product.variants.length}</td><td>{base ? formatMoney(base.priceInCents) : "—"}</td><td>{product.availableStock}</td><td><Link href={`/productos/${product.slug}`}>Ver ↗</Link></td></tr>;
          })}</tbody>
        </table>
      </section>
    </>
  );
}
