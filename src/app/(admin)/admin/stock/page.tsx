import { requireAdmin } from "@/modules/auth/presentation/session";
import { listInventoryRows, listRecentInventoryMovements } from "@/modules/catalog/infrastructure/admin-catalog-query";
import { InventoryAdjustmentForm } from "@/modules/inventory/presentation/inventory-adjustment-form";

export const dynamic = "force-dynamic";

export default async function AdminStockPage() {
  await requireAdmin("inventory.read");
  const [rows, movements] = await Promise.all([listInventoryRows(), listRecentInventoryMovements()]);
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Trazabilidad</p><h1>Inventario</h1><p>Todo ajuste modifica stock y registra un movimiento dentro de la misma transacción.</p></div></div>
    <section className="admin-panel admin-table-wrap"><table className="admin-table admin-table--stock"><thead><tr><th>Producto / variante</th><th>SKU</th><th>Físico</th><th>Reservado</th><th>Disponible</th><th>Mínimo</th><th>Ajuste manual</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.productName}</strong><small>{row.variantName}</small></td><td>{row.sku}</td><td>{row.stockOnHand}</td><td>{row.stockReserved}</td><td><span className={row.isLowStock ? "stock stock--out" : "stock stock--ok"}>{row.available}</span></td><td>{row.minimumStock}</td><td><InventoryAdjustmentForm inventoryId={row.id} /></td></tr>)}</tbody></table></section>
    <section className="admin-panel admin-table-wrap"><div className="panel-heading"><div><p className="eyebrow">Historial</p><h2>Últimos movimientos</h2></div></div><table className="admin-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Variación</th><th>Antes</th><th>Después</th><th>Motivo</th><th>Actor</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{movement.createdAt.toLocaleString("es-AR")}</td><td><strong>{movement.productName}</strong><small>{movement.variantName} · {movement.sku}</small></td><td>{movement.type}</td><td>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td><td>{movement.stockBefore}</td><td>{movement.stockAfter}</td><td>{movement.reason}</td><td>{movement.actor}</td></tr>)}</tbody></table></section>
  </>;
}
