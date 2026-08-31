import { listInventoryRows } from "@/modules/catalog/infrastructure/admin-catalog-query";

export const dynamic = "force-dynamic";

export default async function AdminStockPage() {
  const rows = await listInventoryRows();
  return (
    <>
      <div className="admin-heading"><div><p className="eyebrow">Trazabilidad</p><h1>Inventario</h1><p>El stock se controla por variante y todo cambio genera un movimiento.</p></div><button className="button button--dark" disabled type="button">Registrar movimiento · próximo</button></div>
      <section className="admin-panel admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Producto / variante</th><th>SKU</th><th>Físico</th><th>Reservado</th><th>Disponible</th><th>Mínimo</th><th>Último movimiento</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.productName}</strong><small>{row.variantName}</small></td><td>{row.sku}</td><td>{row.stockOnHand}</td><td>{row.stockReserved}</td><td><span className={row.isLowStock ? "stock stock--out" : "stock stock--ok"}>{row.available}</span></td><td>{row.minimumStock}</td><td>{row.lastMovement ?? "Sin movimientos"}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}
