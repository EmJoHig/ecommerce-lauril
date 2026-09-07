export type AdminUserListItem = Readonly<{
  id: string; email: string; firstName: string; lastName: string; status: "ACTIVE" | "INVITED" | "DISABLED";
  lastLoginAt: Date | null; createdAt: Date; roles: ReadonlyArray<Readonly<{ id: string; code: string; name: string }>>;
}>;

export type AdminRoleView = Readonly<{
  id: string; code: string; name: string; description: string | null; userCount: number;
  permissions: ReadonlyArray<Readonly<{ code: string; name: string }>>;
}>;

export interface AdminAccessRepository {
  listAdmins(): Promise<ReadonlyArray<AdminUserListItem>>;
  listRoles(): Promise<ReadonlyArray<AdminRoleView>>;
  rolesGrantAdminAccess(roleIds: ReadonlyArray<string>): Promise<boolean>;
  createAdmin(input: Readonly<{
    email: string; passwordHash: string; firstName: string; lastName: string;
    roleIds: ReadonlyArray<string>; actorUserId: string; occurredAt: Date;
  }>): Promise<{ id: string }>;
  setStatus(input: Readonly<{
    userId: string; status: "ACTIVE" | "DISABLED"; actorUserId: string; occurredAt: Date;
  }>): Promise<void>;
  updateRoles(input: Readonly<{
    userId: string; roleIds: ReadonlyArray<string>; actorUserId: string; occurredAt: Date;
  }>): Promise<void>;
}
