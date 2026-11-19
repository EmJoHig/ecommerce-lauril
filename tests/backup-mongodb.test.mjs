import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { checkFailure, childEnvironment, compareSnapshots, diagnostic, downloadFromStorage, makeKey, storeWithRclone, validateEmptyRestoreTarget, validateRestoreTarget, validateSourceUri } from "../scripts/backup-mongodb.mjs";

const source = "mongodb+srv://user:secret@cluster.example.mongodb.net/lauril_ecommerce";
const target = "mongodb://127.0.0.1:27018/lauril_restore_prueba";

test("los subprocesos no heredan secretos de backup ni contraseña Rclone", () => {
  assert.deepEqual(childEnvironment({
    PATH: "test", BACKUP_MONGODB_URI: "secret", MONGODB_URI: "secret",
    RCLONE_CONFIG_PASS: "secret", RCLONE_PASSWORD_COMMAND: "secret", AWS_SECRET_ACCESS_KEY: "secret",
  }), { PATH: "test" });
});

test("solo admite el destino local de prueba incluido en la lista explícita", () => {
  assert.equal(validateRestoreTarget(source, target, "127.0.0.1:27018"), "lauril_restore_prueba");
  assert.throws(() => validateRestoreTarget(source, source, "127.0.0.1:27018"));
  assert.throws(() => validateRestoreTarget(source, "mongodb://prod.example:27018/lauril_restore_prueba", "127.0.0.1:27018"));
  assert.throws(() => validateRestoreTarget(source, "mongodb://127.0.0.1:27017/lauril_restore_prueba", "127.0.0.1:27018"));
  assert.throws(() => validateRestoreTarget(source, target, ""));
});

test("el origen exige una URI SRV de Atlas y la base de Lauril", () => {
  assert.equal(validateSourceUri(source).pathname, "/lauril_ecommerce");
  assert.throws(() => validateSourceUri("mongodb+srv://u:p@otro.example.com/lauril_ecommerce"));
  assert.throws(() => validateSourceUri("mongodb+srv://u:p@cluster.example.mongodb.net/otra_base"));
});

test("restauración ficticia exige servidor 8.0, base vacía e identidad estable", () => {
  const sourceSnapshot = { serverVersion: "8.0.37" };
  const targetSnapshot = { serverVersion: "8.0.37", topology: "standalone",
    serverProcessId: "a".repeat(24), collections: {} };
  assert.equal(validateEmptyRestoreTarget(sourceSnapshot, targetSnapshot), targetSnapshot.serverProcessId);
  assert.throws(() => validateEmptyRestoreTarget(sourceSnapshot, { ...targetSnapshot, serverVersion: "7.0.9" }));
  assert.throws(() => validateEmptyRestoreTarget(sourceSnapshot, { ...targetSnapshot, collections: { orders: {} } }));
  assert.throws(() => validateEmptyRestoreTarget(sourceSnapshot, targetSnapshot, "b".repeat(24)));
});

test("la clave combina fecha UTC e identificador único", () => {
  const key = makeKey(new Date("2026-11-12T12:34:56.000Z"), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.match(key, /^lauril\/mongodb\/2026-11-12T12-34-56-000Z-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\.archive\.gz$/);
});

test("el inventario detecta cambios y relaciones inválidas", () => {
  const before = { collections: { orders: { count: 2, indexes: [{ name: "_id_" }] } },
    problems: { orphans: 0 }, commercial: { orderTotalInCents: "1000" } };
  assert.equal(compareSnapshots(before, structuredClone(before)), true);
  assert.equal(compareSnapshots(before, { ...before, collections: { orders: { count: 3, indexes: [{ name: "_id_" }] } } }), false);
  assert.equal(compareSnapshots(before, { ...before, problems: { orphans: 1 } }), false);
  assert.equal(compareSnapshots(before, { ...before, commercial: { orderTotalInCents: "1001" } }), false);
});

test("subida cifrada ficticia comprueba colisión y usa ignore-existing", async () => {
  const key = makeKey(new Date("2026-11-12T12:34:56.000Z"), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "lsjson" && !args.includes("--stat")) return "[]";
    if (args[0] === "lsjson") return JSON.stringify({ Name: path.posix.basename(key), Size: 18 });
    return "";
  };
  let stored = false;
  await storeWithRclone("C:\\temp\\backup.archive.gz", key, run, () => { stored = true; });
  assert.equal(stored, true);
  assert.ok(calls.some((args) => args[0] === "copyto" && args.includes("--ignore-existing")));
  await assert.rejects(storeWithRclone("C:\\temp\\backup.archive.gz", key, async (args) =>
    args[0] === "lsjson" ? JSON.stringify([{ Name: path.posix.basename(key) }]) : ""));
});

test("descarga ficticia verifica SHA-256 y tamaño", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lauril-test-"));
  const output = path.join(directory, "backup.archive.gz");
  const bytes = Buffer.from("respaldo ficticio");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const key = "lauril/mongodb/2026-11-12T12-34-56-000Z-id.archive.gz";
  const run = async (args) => {
    if (args[0] === "lsjson") return JSON.stringify({ Name: path.posix.basename(key), Size: bytes.length });
    if (args[0] === "copyto") await writeFile(args[2], bytes);
    return "";
  };
  try {
    const result = await downloadFromStorage(key, output, { sha256: digest, bytes: bytes.length }, run);
    assert.equal(result.sha256, digest);
    assert.deepEqual(await readFile(output), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("descarga ficticia con hash incorrecto elimina el archivo parcial", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lauril-test-"));
  const output = path.join(directory, "backup.archive.gz");
  const key = "lauril/mongodb/2026-11-12T12-34-56-000Z-id.archive.gz";
  const run = async (args) => {
    if (args[0] === "lsjson") return JSON.stringify({ Name: path.posix.basename(key), Size: 3 });
    if (args[0] === "copyto") await writeFile(args[2], "abc");
    return "";
  };
  try {
    await assert.rejects(downloadFromStorage(key, output, { sha256: "0".repeat(64), bytes: 3 }, run));
    await assert.rejects(stat(output));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("verificador mongosh inventaría colecciones e índices ficticios", async () => {
  const script = await readFile(new URL("../scripts/backup-check.mongosh.js", import.meta.url), "utf8");
  let result;
  const fakeDb = {
    adminCommand: async (command) => command.buildInfo ? { version: "8.0.37" } :
      { ok: 1, topologyVersion: { processId: { toHexString: () => { throw new TypeError("legacy id"); },
        toString: () => "a".repeat(24) } } },
    getCollectionNames: async () => ["orders", "payment_attempts", "products", "inventory"],
    getCollection: (name) => ({
      countDocuments: async (query) => query.$expr ? 0 : name === "orders" ? 2 : 1,
      getIndexes: async () => [{ name: "_id_", key: { _id: 1 }, unique: true }],
      aggregate: (pipeline) => ({ toArray: async () =>
        name === "payment_attempts" && pipeline.some((stage) => stage.$lookup) ? [{ value: 1 }] :
        pipeline[0].$group?.value?.$sum === "$total_in_cents" ? [{ value: 4200 }] : [] }),
    }),
  };
  await runInNewContext(script, {
    Mongo: class { getDB() { return fakeDb; } },
    process: { env: { BACKUP_CHECK_URI: target, BACKUP_CHECK_DB: "lauril_restore_prueba" } },
    print: (line) => { result = JSON.parse(line.slice("LAURIL_BACKUP_CHECK:".length)); },
  });
  assert.equal(result.collections.orders.count, 2);
  assert.equal(result.topology, "standalone");
  assert.equal(result.serverVersion, "8.0.37");
  assert.equal(result.serverProcessId, "a".repeat(24));
  assert.equal(result.collections.payment_attempts.indexes[0].unique, true);
  assert.equal(result.problems.paymentAttemptsWithoutOrder, 1);
  assert.equal(result.problems.invalidInventory, 0);
  assert.equal(result.collections.products.count, 1);
  assert.equal(result.collections.inventory.count, 1);
  assert.equal(result.commercial.orderTotalInCents, "4200");
});


test("el marcador del verificador solo acepta códigos y operaciones fijos", () => {
  assert.deepEqual(checkFailure("LAURIL_BACKUP_ERROR:PERMISSION:list_collections\n"),
    { backupCode: "PERMISSION", backupOperation: "list_collections" });
  assert.equal(checkFailure("LAURIL_BACKUP_ERROR:PERMISSION:list_collections:mongodb+srv://user:secret@host"), null);
  assert.equal(checkFailure("mongodb+srv://user:secret@host"), null);
});

test("las consultas ficticias fallidas indican operación sin filtrar el error", async () => {
  const script = await readFile(new URL("../scripts/backup-check.mongosh.js", import.meta.url), "utf8");
  for (const [operation, category, failure] of [
    ["hello", "CONNECTION", { name: "MongoNetworkError" }],
    ["list_collections", "PERMISSION", { code: 13, message: "mongodb+srv://user:secret@host" }],
    ["list_indexes", "INVENTORY", { message: "documento comercial secreto" }],
    ["build_info", "VERSION", { message: "token secreto" }],
    ["serialize_inventory", "INVENTORY", { message: "documento comercial secreto" }],
  ]) {
    const lines = [];
    const fakeDb = {
      adminCommand: async (command) => {
        if (operation === "hello" || operation === "build_info" && command.buildInfo) throw failure;
        return command.buildInfo ? { version: "8.0.37" } : { setName: "rs-fixture" };
      },
      getCollectionNames: async () => { if (operation === "list_collections") throw failure; return ["orders"]; },
      getCollection: () => ({ countDocuments: async () => 0,
        getIndexes: async () => { if (operation === "list_indexes") throw failure;
          return operation === "serialize_inventory" ?
            [{ name: "_id_", key: { toJSON: () => { throw failure; } } }] : []; },
        aggregate: () => ({ toArray: async () => [] }) }),
    };
    await assert.rejects(runInNewContext(script, {
      Mongo: class { getDB() { return fakeDb; } },
      process: { env: { BACKUP_CHECK_URI: target, BACKUP_CHECK_DB: "fixture" } },
      print: (line) => lines.push(line),
      exit: () => { throw new Error("exit"); },
    }));
    assert.deepEqual(checkFailure(lines.join("\n")),
      { backupCode: category, backupOperation: operation });
    assert.doesNotMatch(lines.join("\n"), /secret|token|documento|mongodb\+srv/i);
  }
});

test("result.json registra un fallo de configuración ficticio sin credenciales", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lauril-diagnostic-test-"));
  const secretUri = "mongodb+srv://user:secret@cluster.example.mongodb.net/lauril_ecommerce";
  try {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/backup-mongodb.mjs", import.meta.url)), "manual"], {
      env: { PATH: process.env.PATH, LOCALAPPDATA: directory, BACKUP_MONGODB_URI: secretUri,
        BACKUP_CONSISTENCY_MODE: "invalid" }, encoding: "utf8",
    });
    assert.equal(child.status, 1);
    const runs = await import("node:fs/promises").then((fs) => fs.readdir(path.join(directory, "Lauril", "backup-runs")));
    assert.equal(runs.length, 1);
    const content = await readFile(path.join(directory, "Lauril", "backup-runs", runs[0], "result.json"), "utf8");
    assert.equal(JSON.parse(content).errorCode, "CONFIG");
    assert.ok(!(content + child.stdout + child.stderr).includes(secretUri));
    assert.doesNotMatch(content + child.stdout + child.stderr, /user:secret@/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("el diagnóstico descarta códigos y operaciones ajenos a la lista segura", () => {
  const error = { backupCode: "mongodb+srv://user:secret@host", backupOperation: "token secreto" };
  assert.deepEqual(diagnostic(error, "MONGODUMP"), { errorCode: "MONGODUMP" });
  assert.deepEqual(diagnostic({ backupCode: "PERMISSION", backupOperation: "list_indexes" }, "INVENTORY"),
    { errorCode: "PERMISSION", errorOperation: "list_indexes" });
});


test("processId ficticio se omite en replica set y se valida en standalone", async () => {
  const script = await readFile(new URL("../scripts/backup-check.mongosh.js", import.meta.url), "utf8");
  const run = (hello) => {
    const lines = [];
    const database = {
      adminCommand: async (command) => command.buildInfo ? { version: "8.0.37" } : hello,
      getCollectionNames: async () => [],
    };
    const promise = runInNewContext(script, {
      Mongo: class { getDB() { return database; } },
      process: { env: { BACKUP_CHECK_URI: target, BACKUP_CHECK_DB: "fixture" } },
      print: (line) => lines.push(line),
      exit: () => { throw new Error("exit"); },
    });
    return { promise, lines };
  };
  const replica = run({ setName: "rs-fixture", topologyVersion: {
    get processId() { throw new TypeError("No debe leerse processId en Atlas"); },
  } });
  await replica.promise;
  const replicaResult = JSON.parse(replica.lines[0].slice("LAURIL_BACKUP_CHECK:".length));
  assert.equal(replicaResult.topology, "replica_set");
  assert.equal(replicaResult.serverProcessId, null);

  const standalone = run({ topologyVersion: { processId: {
    toHexString: () => { throw new TypeError("legacy id"); },
    toString: () => "b".repeat(24),
  } } });
  await standalone.promise;
  const standaloneResult = JSON.parse(standalone.lines[0].slice("LAURIL_BACKUP_CHECK:".length));
  assert.equal(standaloneResult.serverProcessId, "b".repeat(24));

  const invalid = run({ topologyVersion: { processId: {
    toString: () => { throw new TypeError("mongodb+srv://user:secret@host"); },
  } } });
  await assert.rejects(invalid.promise);
  assert.deepEqual(checkFailure(invalid.lines.join("\n")),
    { backupCode: "INVENTORY", backupOperation: "process_id" });
  assert.doesNotMatch(invalid.lines.join("\n"), /secret|mongodb\+srv/i);

  const malformed = run({ topologyVersion: { processId: { toString: () => "no-es-un-objectid" } } });
  await assert.rejects(malformed.promise);
  assert.deepEqual(checkFailure(malformed.lines.join("\n")),
    { backupCode: "INVENTORY", backupOperation: "process_id" });
});
