import { requireAdmin } from "@/modules/auth/presentation/session";
import { getAdminAccessService } from "@/modules/auth/infrastructure/admin-access-composition";
import { AdminRolesForm, AdminStatusForm, CreateAdminForm } from "@/modules/auth/presentation/admin-access-forms";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin("users.read");
  const service = getAdminAccessService();
  const [admins, roles] = await Promise.all([service.listAdmins(), service.listRoles()]);
  return <>
    <div className="admin-heading"><div><p className="eyebrow">Administración</p><h1>Usuarios administradores</h1><p>{admins.length} cuentas con acceso al backoffice.</p></div></div>
    <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">Alta segura</p><h2>Nuevo administrador</h2></div></div><CreateAdminForm roles={roles} /></section>
    <section className="admin-panel admin-table-wrap"><table className="admin-table"><thead><tr><th>Administrador</th><th>Estado</th><th>Último acceso</th><th>Roles</th><th>Acciones</th></tr></thead><tbody>{admins.map((admin) => <tr key={admin.id}><td><strong>{admin.firstName} {admin.lastName}</strong><small>{admin.email}</small><small>Alta: {admin.createdAt.toLocaleDateString("es-AR")}</small></td><td><span className={`status-badge status-badge--${admin.status.toLowerCase()}`}>{admin.status}</span></td><td>{admin.lastLoginAt?.toLocaleString("es-AR") ?? "Nunca"}</td><td><AdminRolesForm assignedRoleIds={admin.roles.map((role) => role.id)} roles={roles} userId={admin.id} /></td><td><AdminStatusForm status={admin.status} userId={admin.id} /></td></tr>)}</tbody></table></section>
  </>;
}
