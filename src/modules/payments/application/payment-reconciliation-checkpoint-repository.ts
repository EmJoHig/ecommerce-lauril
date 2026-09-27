export type ReconciliationCursor = Readonly<{ updatedAt: Date; id: string }>;

export type PaymentReconciliationProgress = Readonly<{
  // null marks a completed cycle. Only a subsequent execution starts a new one.
  cycleCutoff: Date | null;
  cursor: ReconciliationCursor | null;
}>;

export type PaymentReconciliationCheckpoint = PaymentReconciliationProgress & Readonly<{
  version: number;
}>;

export interface PaymentReconciliationCheckpointRepository {
  getOrCreate(cycleCutoff: Date): Promise<PaymentReconciliationCheckpoint>;
  get(): Promise<PaymentReconciliationCheckpoint>;
  compareAndSet(expectedVersion: number, progress: PaymentReconciliationProgress): Promise<boolean>;
}
