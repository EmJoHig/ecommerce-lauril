import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPaymentAttemptRepository } from "../src/modules/payments/infrastructure/prisma-payment-attempt-repository";
import { PrismaPaymentConfirmationUnitOfWork } from "../src/modules/payments/infrastructure/prisma-payment-confirmation-unit-of-work";
import { PrismaPaymentReconciliationCheckpointRepository } from "../src/modules/payments/infrastructure/prisma-payment-reconciliation-checkpoint-repository";
import { MercadoPagoOrdersGateway } from "../src/modules/payments/infrastructure/mercado-pago-orders-gateway";
import { FinalizeMercadoPagoPayment } from "../src/modules/payments/application/finalize-mercado-pago-payment";
import { RECONCILIATION_JOB, ReconcileMercadoPagoPayments } from "../src/modules/payments/application/reconcile-mercado-pago-payments";

export async function runReconciliationJob(): Promise<void> {
  let stage = "configuration";
  try {
    await import("dotenv/config");
    const args = process.argv.slice(2);
    if (args.length !== 0) {
      throw new Error("Argumentos inválidos.");
    }
    const env = z.object({
      MONGODB_URI: z.string().min(1),
      MERCADO_PAGO_ENABLED: z.literal("true"),
      MERCADO_PAGO_ACCESS_TOKEN: z.string().trim().min(1),
      APP_URL: z.url(),
    }).parse(process.env);
    stage = "execution";
    const prisma = new PrismaClient();
    try {
      const gateway = new MercadoPagoOrdersGateway(env.MERCADO_PAGO_ACCESS_TOKEN, env.APP_URL);
      const result = await new ReconcileMercadoPagoPayments(
        new PrismaPaymentAttemptRepository(prisma), gateway,
        new FinalizeMercadoPagoPayment(gateway, new PrismaPaymentConfirmationUnitOfWork(prisma)),
        new PrismaPaymentReconciliationCheckpointRepository(prisma),
      ).execute();
      console.info(JSON.stringify(result));
      if (result.failed > 0) process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    console.error(JSON.stringify({ job: RECONCILIATION_JOB, status: "error", reasonCode: `${stage}_failed` }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runReconciliationJob();
}
