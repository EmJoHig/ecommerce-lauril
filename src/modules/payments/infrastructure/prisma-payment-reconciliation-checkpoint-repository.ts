import type { PrismaClient } from "@/generated/prisma/client";
import type {
  PaymentReconciliationCheckpoint,
  PaymentReconciliationCheckpointRepository,
  PaymentReconciliationProgress,
} from "../application/payment-reconciliation-checkpoint-repository";
import { RECONCILIATION_JOB } from "../application/reconcile-mercado-pago-payments";

export class PrismaPaymentReconciliationCheckpointRepository implements PaymentReconciliationCheckpointRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(cycleCutoff: Date): Promise<PaymentReconciliationCheckpoint> {
    const existing = await this.prisma.paymentReconciliationCheckpoint.findUnique({ where: { id: RECONCILIATION_JOB } });
    if (existing) return mapCheckpoint(existing);
    try {
      return mapCheckpoint(await this.prisma.paymentReconciliationCheckpoint.create({
        data: { id: RECONCILIATION_JOB, cycleCutoff, cursorUpdatedAt: null, cursorId: null, version: 0 },
      }));
    } catch (error) {
      // A concurrent first run may have created the fixed primary key already.
      if (!(error instanceof Error && "code" in error && error.code === "P2002")) throw error;
      return this.get();
    }
  }

  async get(): Promise<PaymentReconciliationCheckpoint> {
    return mapCheckpoint(await this.prisma.paymentReconciliationCheckpoint.findUniqueOrThrow({
      where: { id: RECONCILIATION_JOB },
    }));
  }

  async compareAndSet(expectedVersion: number, progress: PaymentReconciliationProgress): Promise<boolean> {
    const result = await this.prisma.paymentReconciliationCheckpoint.updateMany({
      where: { id: RECONCILIATION_JOB, version: expectedVersion },
      data: {
        cycleCutoff: progress.cycleCutoff,
        cursorUpdatedAt: progress.cursor?.updatedAt ?? null,
        cursorId: progress.cursor?.id ?? null,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }
}

function mapCheckpoint(row: {
  cycleCutoff: Date | null; cursorUpdatedAt: Date | null; cursorId: string | null; version: number;
}): PaymentReconciliationCheckpoint {
  if ((row.cursorUpdatedAt === null) !== (row.cursorId === null)
    || (row.cycleCutoff === null && row.cursorId !== null)) {
    throw new Error("Checkpoint de reconciliación inconsistente.");
  }
  return {
    cycleCutoff: row.cycleCutoff,
    cursor: row.cursorUpdatedAt !== null && row.cursorId !== null
      ? { updatedAt: row.cursorUpdatedAt, id: row.cursorId } : null,
    version: row.version,
  };
}
