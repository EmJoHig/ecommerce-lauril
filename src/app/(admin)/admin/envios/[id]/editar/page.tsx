import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { getShippingAdminService } from "@/modules/shipping/infrastructure/shipping-composition";
import { ShippingForm } from "@/modules/shipping/presentation/shipping-form";
import { NotFoundError } from "@/shared/domain/errors";
import { formatMoneyInput } from "@/shared/domain/money";
export const dynamic = "force-dynamic";
export default async function EditShippingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireAdmin("shipping.write");
  const { id } = await params;
  const query = await searchParams;
  let method;
  try { method = await getShippingAdminService().get(id); }
  catch (error) { if (error instanceof NotFoundError) notFound(); throw error; }
  return <><div className="admin-heading"><div><p className="eyebrow">Ventas</p><h1>Editar método</h1></div></div>{query.guardado ? <div className="form-success">Método guardado correctamente.</div> : null}<ShippingForm initial={{ id: method.id, code: method.code, name: method.name, description: method.description ?? "", type: method.type, cost: formatMoneyInput(method.costInCents), requiresAddress: method.requiresAddress, minimumSubtotal: method.minimumSubtotalInCents === null ? "" : formatMoneyInput(method.minimumSubtotalInCents), freeShippingFrom: method.freeShippingFromInCents === null ? "" : formatMoneyInput(method.freeShippingFromInCents), isActive: method.isActive, sortOrder: method.sortOrder }} /></>;
}
