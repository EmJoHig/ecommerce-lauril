import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentRaceFixture, now } from "./helpers/payment-race-fixture";

const mocks = vi.hoisted(() => ({ prisma: {} as object, gateway: {} as object }));
vi.mock("dotenv/config", () => ({}));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {}, PrismaClient: vi.fn(function () { return mocks.prisma; }),
}));
vi.mock("@/modules/payments/infrastructure/mercado-pago-orders-gateway", () => ({
  MercadoPagoOrdersGateway: vi.fn(function () { return mocks.gateway; }),
}));

const savedArgs = process.argv;
const savedExitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules();
  process.argv = ["node", "tests/reconcile-payments-script.test.ts"];
  process.exitCode = 0;
  vi.stubEnv("MONGODB_URI", "mongodb://isolated.invalid/test");
  vi.stubEnv("MERCADO_PAGO_ENABLED", "true");
  vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "test-only-token");
  vi.stubEnv("APP_URL", "https://example.test");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.argv = savedArgs;
  process.exitCode = savedExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const f = paymentRaceFixture(new Date(now.getTime() + 10 * 60_000));
  await f.start();
  f.client.paymentAttempt.rows[0]!.updatedAt = new Date("2020-01-01T00:00:00Z");
  const disconnect = vi.fn();
  mocks.prisma = { ...f.client, $disconnect: disconnect };
  mocks.gateway = f.gateway;
  return { f, disconnect };
}

describe("reconcile script with isolated database/provider doubles only", () => {
  it("entrypoint directo ejecuta una única corrida simulada", async () => {
    const { f, disconnect } = await setup();
    process.argv = ["node", "scripts/reconcile-payments.ts"];
    await import("../scripts/reconcile-payments");
    expect(process.exitCode).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(f.sales).toHaveLength(1);
  });

  it("importar módulo no abre conexiones ni ejecuta conciliación", async () => {
    const { f, disconnect } = await setup();
    const { PrismaClient } = await import("@/generated/prisma/client");
    vi.mocked(PrismaClient).mockClear();
    process.argv = ["node", "tests/reconcile-payments-script.test.ts"];
    await import("../scripts/reconcile-payments");
    expect(PrismaClient).not.toHaveBeenCalled();
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("ejecuta corrida, imprime JSON sin PII, desconecta y sale correctamente", async () => {
    const { f, disconnect } = await setup();
    const { runReconciliationJob } = await import("../scripts/reconcile-payments");
    await runReconciliationJob();
    expect(process.exitCode).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(f.sales).toHaveLength(1);
    const logs = vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(line));
    expect(logs.at(-1)).toMatchObject({ job: "mercado-pago-reconciliation", status: "ok", scanned: 1, reconciled: 1 });
    expect(JSON.stringify(logs)).not.toMatch(/buyer|test-only-token|mongodb/);
  });

  it("fallo global DB devuelve error genérico, exit 1 y desconecta", async () => {
    const { f, disconnect } = await setup();
    f.client.paymentAttempt.findMany.mockRejectedValue(new Error("sensitive DB failure"));
    const { runReconciliationJob } = await import("../scripts/reconcile-payments");
    await runReconciliationJob();
    expect(process.exitCode).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ job: "mercado-pago-reconciliation", status: "error", reasonCode: "execution_failed" }));
  });

  it("fallo individual imprime resumen parcial y exit 1", async () => {
    const { f, disconnect } = await setup();
    f.gateway.getPaymentState.mockRejectedValue(new Error("provider unavailable"));
    const { runReconciliationJob } = await import("../scripts/reconcile-payments");
    await runReconciliationJob();
    expect(process.exitCode).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(console.info).mock.calls.at(-1)![0])).toMatchObject({ status: "partial", failed: 1 });
  });

  it("configuración deshabilitada no inicia conexiones ni llamadas", async () => {
    const { f, disconnect } = await setup();
    vi.stubEnv("MERCADO_PAGO_ENABLED", "false");
    const { runReconciliationJob } = await import("../scripts/reconcile-payments");
    await runReconciliationJob();
    expect(process.exitCode).toBe(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(f.gateway.getPaymentState).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
      job: "mercado-pago-reconciliation", status: "error", reasonCode: "configuration_failed",
    }));
  });
});
