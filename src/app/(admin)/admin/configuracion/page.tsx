import { requireAdmin } from "@/modules/auth/presentation/session";
import { getStoreSettingsService } from "@/modules/store-settings/infrastructure/store-settings-composition";
import { StoreSettingsForm } from "@/modules/store-settings/presentation/store-settings-form";

export const dynamic = "force-dynamic";

export default async function StoreSettingsPage() {
  await requireAdmin();
  const settings = await getStoreSettingsService().get();
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Administración</p><h1>Configuración de la tienda</h1><p>Datos comerciales visibles en los canales públicos.</p></div></div>
    <StoreSettingsForm settings={settings} />
  </>;
}
