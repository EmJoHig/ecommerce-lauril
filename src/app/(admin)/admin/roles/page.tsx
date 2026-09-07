import { requireAdmin } from "@/modules/auth/presentation/session";
import { getAdminAccessService } from "@/modules/auth/infrastructure/admin-access-composition";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  await requireAdmin("roles.read");
  const roles = await getAdminAccessService().listRoles();
  return <><div className="admin-heading"><div><p className="eyebrow">Administración</p><h1>Roles y permisos</h1><p>Vista de solo lectura de las capacidades efectivas.</p></div></div><section className="role-grid">{roles.map((role) => <article className="admin-panel" key={role.id}><div className="panel-heading"><div><p className="eyebrow">{role.code}</p><h2>{role.name}</h2></div><span>{role.userCount} usuarios</span></div><p>{role.description ?? "Sin descripción"}</p><ul className="permission-list">{role.permissions.map((permission) => <li key={permission.code}><strong>{permission.code}</strong><span>{permission.name}</span></li>)}</ul></article>)}</section></>;
}
