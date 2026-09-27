import { ConflictError } from "@/shared/domain/errors";
import type { PaymentAttempt } from "../domain/payment";
import type { PaymentGateway } from "./payment-gateway";
import { FinalizeMercadoPagoPayment } from "./finalize-mercado-pago-payment";
import type { PaymentReconciliationCheckpointRepository, PaymentReconciliationProgress, ReconciliationCursor } from "./payment-reconciliation-checkpoint-repository";

export const RECONCILIATION_GRACE_MS = 5 * 60_000;
export const RECONCILIATION_LIMIT = 100;
export const RECONCILIATION_PAGE_SIZE = 25;
export const RECONCILIATION_JOB = "mercado-pago-reconciliation";

export type { ReconciliationCursor } from "./payment-reconciliation-checkpoint-repository";
export interface PaymentReconciliationCandidates {
  listReconciliationCandidates(input: Readonly<{
    before: Date;
    after?: ReconciliationCursor;
    limit: number;
  }>): Promise<ReadonlyArray<PaymentAttempt>>;
}

export type ReconciliationLog = Readonly<{
  source: "reconciliation";
  paymentAttemptId: string;
  outcome: string;
  reasonCode?: string;
}>;

export class ReconcileMercadoPagoPayments {
  constructor(
    private readonly candidates: PaymentReconciliationCandidates,
    private readonly gateway: PaymentGateway,
    private readonly finalizer: FinalizeMercadoPagoPayment,
    private readonly checkpoints: PaymentReconciliationCheckpointRepository,
    private readonly log: (entry: ReconciliationLog) => void = (entry) => console.info(JSON.stringify(entry)),
  ) {}

  async execute(now = new Date()) {
    const newCutoff = new Date(now.getTime() - RECONCILIATION_GRACE_MS);
    let checkpoint = await this.checkpoints.getOrCreate(newCutoff);
    const summary = {
      job: RECONCILIATION_JOB, status: "ok" as "ok" | "partial",
      scanned: 0, reconciled: 0, unchanged: 0, skipped: 0, requiresReview: 0, failed: 0,
      nextCursor: checkpoint.cursor,
      cycleCutoff: checkpoint.cycleCutoff ?? newCutoff,
      cycleCompleted: false, checkpointAdvanced: false, checkpointConflict: false,
      checkpointVersion: checkpoint.version,
    };
    const saveProgress = async (progress: PaymentReconciliationProgress): Promise<boolean> => {
      if (!(await this.checkpoints.compareAndSet(checkpoint.version, progress))) {
        // Never overwrite or reuse another process's version. Re-read for the
        // operational result, then stop this execution without further visits.
        const current = await this.checkpoints.get();
        summary.checkpointConflict = true;
        summary.checkpointVersion = current.version;
        summary.nextCursor = current.cursor;
        return false;
      }
      checkpoint = { ...progress, version: checkpoint.version + 1 };
      summary.checkpointAdvanced = true;
      summary.checkpointVersion = checkpoint.version;
      summary.nextCursor = checkpoint.cursor;
      return true;
    };
    if (checkpoint.cycleCutoff === null) {
      if (!(await saveProgress({ cycleCutoff: newCutoff, cursor: null }))) return summary;
    }
    const before = checkpoint.cycleCutoff!;
    let cursor = checkpoint.cursor;
    while (summary.scanned < RECONCILIATION_LIMIT) {
      // Query failures are global: stop, let the operational runner report failure.
      const page = await this.candidates.listReconciliationCandidates({
        before, ...(cursor ? { after: cursor } : {}),
        limit: Math.min(RECONCILIATION_PAGE_SIZE, RECONCILIATION_LIMIT - summary.scanned),
      });
      if (page.length === 0) {
        summary.cycleCompleted = await saveProgress({ cycleCutoff: null, cursor: null });
        break;
      }
      for (const attempt of page) {
        summary.scanned += 1;
        const report = (outcome: string, reasonCode?: string) => this.log({
          source: "reconciliation", paymentAttemptId: attempt.id, outcome,
          ...(reasonCode ? { reasonCode } : {}),
        });
        const visit = async () => {
          if (!attempt.providerResourceId) {
            summary.skipped += 1;
            report("skipped", "missing_provider_resource");
            return;
          }
          let external;
          try {
            external = await this.gateway.getPaymentState(attempt.providerResourceId);
          } catch (error) {
            if (stopProviderBatch(error)) throw error;
            summary.failed += 1;
            report("failed", "provider_query_failed");
            return;
          }
          try {
            const result = await this.finalizer.execute(attempt.id, external, now, null, attempt.updatedAt);
            if (result.kind === "requires_review") summary.requiresReview += 1;
            else if (result.kind === "pending" || result.kind === "duplicate") summary.unchanged += 1;
            else if (result.kind === "ignored") summary.skipped += 1;
            else summary.reconciled += 1;
            report(result.kind, result.reasonCode);
          } catch (error) {
            // Only known per-attempt conflicts/provider failures are recoverable here.
            // Unknown errors and database/configuration outages must not look successful.
            const code = errorCode(error);
            if (stopProviderBatch(error) || !(error instanceof ConflictError
              || ["P2002", "P2025", "P2034", "TIMEOUT", "NETWORK", "RESOURCE_LOCKED",
                "INVALID_REQUEST", "UNAVAILABLE"].includes(code))) throw error;
            summary.failed += 1;
            report("failed", "finalization_failed");
          }
        };
        await visit();
        // Visited does not mean reconciled. Persist failures/skips too, but only
        // after evaluation; a global error or crash leaves this record retryable.
        cursor = { updatedAt: attempt.updatedAt, id: attempt.id };
        if (summary.failed > 0) summary.status = "partial";
        if (!(await saveProgress({ cycleCutoff: before, cursor }))) return summary;
      }
    }
    if (summary.failed > 0) summary.status = "partial";
    return summary;
  }
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String(error.code) : "";
}

function stopProviderBatch(error: unknown): boolean {
  return ["AUTHENTICATION", "RATE_LIMITED"].includes(errorCode(error));
}
