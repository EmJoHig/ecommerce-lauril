import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

type Index = { name: string; key: Record<string, number>; unique?: boolean; partialFilterExpression?: unknown };
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  upsert: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("dotenv/config", () => ({}));
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: vi.fn(function () {
    return { $runCommandRaw: mocks.command, sequence: { upsert: mocks.upsert }, $disconnect: mocks.disconnect };
  }),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("MongoDB reconciliation index ownership", () => {
  it("declara en Prisma las claves completas del cursor, sin unicidad ni filtro parcial", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const model = schema.match(/model PaymentAttempt \{([\s\S]*?)\n\}/)![1]!;
    const declaration = model.match(/@@index\(\[([^\]]+)\], map: "payment_attempts_reconciliation_cursor_idx"\)/);
    expect(declaration).not.toBeNull();
    const fields = declaration![1]!.split(",").map((field) => field.trim());
    const keys = fields.map((field) => {
      const definition = model.split("\n").find((line) => line.trim().startsWith(`${field} `))!;
      return definition.match(/@map\("([^"]+)"\)/)?.[1] ?? field;
    });
    expect(keys).toEqual(["provider", "updated_at", "_id"]);
    expect(model.match(/payment_attempts_reconciliation_cursor_idx/g)).toHaveLength(1);
  });

  it("asegura los diez índices parciales dos veces sin duplicarlos ni alterar el índice del cursor", async () => {
    vi.stubEnv("MONGODB_URI", "isolated-mocked-database");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.clearAllMocks();
    const cursorIndex: Index = {
      name: "payment_attempts_reconciliation_cursor_idx",
      key: { provider: 1, updated_at: 1, _id: 1 },
    };
    const indexes = new Map<string, Index>([[`payment_attempts/${cursorIndex.name}`, cursorIndex]]);
    mocks.command.mockImplementation(async (command: { createIndexes: string; indexes: Index[] }) => {
      expect(Object.keys(command).sort()).toEqual(["createIndexes", "indexes"]);
      for (const index of command.indexes) {
        const key = `${command.createIndexes}/${index.name}`;
        const existing = indexes.get(key);
        if (existing) expect(index).toEqual(existing);
        indexes.set(key, structuredClone(index));
      }
      return { ok: 1 };
    });
    mocks.upsert.mockResolvedValue({ id: "schema:indexes:v1", value: 5n });
    mocks.disconnect.mockResolvedValue(undefined);
    for (let run = 1; run <= 2; run += 1) {
      vi.resetModules();
      await import("../scripts/ensure-mongodb-indexes");
      await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(run));
      expect(indexes.size).toBe(11);
      expect(indexes.get(`payment_attempts/${cursorIndex.name}`)).toEqual(cursorIndex);
      expect([...indexes.values()].filter((index) => index.unique && index.partialFilterExpression)).toHaveLength(10);
    }
    expect(indexes.get("payment_attempts/payment_attempts_one_active_per_order_key")).toMatchObject({
      key: { order_id: 1 }, unique: true,
      partialFilterExpression: { status: { $in: ["CREATED", "PENDING"] } },
    });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });
});
