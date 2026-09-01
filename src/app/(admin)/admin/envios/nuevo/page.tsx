import { requireAdmin } from "@/modules/auth/presentation/session";
import { ShippingForm } from "@/modules/shipping/presentation/shipping-form";
export const dynamic = "force-dynamic";
export default async function NewShippingPage() { await requireAdmin("shipping.write"); return <><div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Nuevo método de entrega</h1></div></div><ShippingForm initial={{ code: "", name: "", description: "", type: "FLAT_RATE", cost: "0", requiresAddress: true, minimumSubtotal: "", freeShippingFrom: "", isActive: true, sortOrder: 0 }} /></>; }
