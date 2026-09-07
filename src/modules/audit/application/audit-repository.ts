export type AuditQuery = Readonly<{
  page: number; pageSize: number; search?: string; action?: string; entityType?: string;
  createdFrom?: Date; createdToExclusive?: Date;
}>;

export type AuditRecord = Readonly<{
  id: string; action: string; entityType: string; entityId: string | null; metadata: unknown;
  ipAddress: string | null; actorName: string; actorEmail: string | null; createdAt: Date;
}>;

export type AuditPage = Readonly<{
  items: ReadonlyArray<AuditRecord>; total: number; page: number; pageSize: number; pageCount: number;
}>;

export interface AuditRepository {
  list(query: AuditQuery): Promise<AuditPage>;
  listFacets(): Promise<Readonly<{ actions: string[]; entityTypes: string[] }>>;
}
