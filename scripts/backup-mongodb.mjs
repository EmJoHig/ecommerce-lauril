import { createHash, randomUUID } from "node:crypto";
import { createReadStream, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
const remote = "lauril_crypt:";

const database = "lauril_ecommerce";
const prefix = "lauril/mongodb/";
const restorePort = "27018";
const checkScript = fileURLToPath(new URL("./backup-check.mongosh.js", import.meta.url));
const interruption = new AbortController();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

export function validateSourceUri(sourceUri) {
  const source = new URL(sourceUri);
  if (source.protocol !== "mongodb+srv:" || !source.hostname.endsWith(".mongodb.net") ||
      source.pathname !== `/${database}` || source.hash || source.port) {
    throw new Error("El origen debe ser la URI SRV de Atlas para Lauril");
  }
  return source;
}

export function validateRestoreTarget(sourceUri, targetUri, allowedTarget) {
  const source = validateSourceUri(sourceUri);
  const target = new URL(targetUri);
  if (target.protocol !== "mongodb:" || target.hostname !== "127.0.0.1" || target.port !== restorePort ||
      !/^\/lauril_restore_[a-z0-9_]+$/.test(target.pathname) || target.search || target.hash ||
      allowedTarget !== `127.0.0.1:${restorePort}` || source.host === target.host) {
    throw new Error("Destino de restauración no permitido: solo MongoDB local explícito");
  }
  return target.pathname.slice(1);
}

export function compareSnapshots(before, after) {
  return JSON.stringify(before.collections) === JSON.stringify(after.collections) &&
    JSON.stringify(before.commercial) === JSON.stringify(after.commercial) &&
    Object.values(before.problems).every((value) => value === 0) &&
    Object.values(after.problems).every((value) => value === 0);
}

export function validateServerVersion(version) {
  if (typeof version !== "string" || !/^8\.0\.\d+(?:[.-].*)?$/.test(version)) {
    throw new Error("La restauración A1 requiere MongoDB Server 8.0");
  }
}

export function validateEmptyRestoreTarget(source, target, expectedProcessId) {
  validateServerVersion(source.serverVersion);
  validateServerVersion(target.serverVersion);
  if (target.topology !== "standalone" || !/^[a-f0-9]{24}$/.test(target.serverProcessId ?? "") ||
      (expectedProcessId && target.serverProcessId !== expectedProcessId) ||
      Object.keys(target.collections).length !== 0) {
    throw new Error("El MongoDB de restauración no es la instancia aislada y vacía esperada");
  }
  return target.serverProcessId;
}

export function makeKey(now = new Date(), id = randomUUID()) {
  return `${prefix}${now.toISOString().replace(/[:.]/g, "-")}-${id}.archive.gz`;
}

export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function childEnvironment(parent = process.env) {
  const env = { ...parent };
  for (const key of Object.keys(env)) {
    if (key.startsWith("BACKUP_") || key.startsWith("AWS_") || key === "MONGODB_URI" ||
        key === "RCLONE_CONFIG_PASS" || key === "RCLONE_PASSWORD_COMMAND") delete env[key];
  }
  return env;
}

async function runTool(name, args, extraEnv = {}, capture = false, interactive = false) {
  const env = childEnvironment();
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { env: { ...env, ...extraEnv }, signal: interruption.signal,
      stdio: [interactive ? "inherit" : "ignore", capture ? "pipe" : "ignore",
        interactive ? "inherit" : "ignore"], windowsHide: true });
    let output = "";
    if (capture) child.stdout.setEncoding("utf8").on("data", (chunk) => {
      output += chunk;
      if (output.length > 2_000_000) child.kill();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) return resolve(output);
      const error = new Error(`${name} falló`);
      error.capturedOutput = output; // Solo se inspecciona el marcador fijo de mongosh.
      reject(error);
    });
  });
}

async function checkTools() {
  for (const tool of ["node", "mongodump", "mongorestore", "mongosh", "rclone"]) {
    try { await runTool(tool, ["--version"]); }
    catch { throw Object.assign(new Error(`Falta ${tool}; instalar MongoDB Database Tools, mongosh o Rclone y agregarlo al PATH`),
      { backupOperation: tool }); }
  }
}

function remotePath(key) {
  if (!/^lauril\/mongodb\/\d{4}-[\w-]+\.archive\.gz$/.test(key)) throw new Error("Clave de respaldo inválida");
  return remote + key;
}

async function rclone(args, capture = false) {
  if (!process.stdin.isTTY) throw new Error("Rclone requiere una consola interactiva para solicitar la contraseña");
  console.log("Rclone puede solicitar la contraseña de configuración en esta consola.");
  return runTool("rclone", ["--ask-password=true", ...args], {}, capture, true);
}

export async function storeWithRclone(archive, key, run = rclone, onStored = () => {}) {
  const destination = remotePath(key);
  const parent = remote + path.posix.dirname(key);
  const name = path.posix.basename(key);
  await run(["mkdir", parent]);
  const entries = JSON.parse(await run(["lsjson", parent], true));
  if (entries.some((item) => item.Name === name)) throw new Error("El respaldo remoto ya existe");
  await run(["copyto", archive, destination, "--ignore-existing", "--retries", "1"]);
  onStored();
  const result = JSON.parse(await run(["lsjson", "--stat", destination], true));
  if (result.IsDir || result.Name !== name) throw new Error("No se confirmó el archivo remoto");
  return result;
}

export async function downloadFromStorage(key, output, expected, run = rclone) {
  const destination = remotePath(key);
  const relative = path.relative(process.cwd(), output);
  if (!path.isAbsolute(output) || relative === "" ||
      (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error("La salida debe ser una ruta absoluta fuera del repositorio");
  }
  const remoteInfo = JSON.parse(await run(["lsjson", "--stat", destination], true));
  if (remoteInfo.IsDir || remoteInfo.Name !== path.posix.basename(key)) throw new Error("Respaldo remoto inválido");
  if (expected?.bytes !== undefined && Number(remoteInfo.Size) !== expected.bytes) throw new Error("Tamaño remoto inesperado");
  await writeFile(output, "", { mode: 0o600, flag: "wx" });
  try {
    await run(["copyto", destination, output, "--retries", "1"]);
    const bytes = (await stat(output)).size;
    const digest = await sha256(output);
    if (bytes !== Number(remoteInfo.Size) || (expected?.sha256 && digest !== expected.sha256)) {
      throw new Error("SHA-256 o tamaño del respaldo descargado no coincide");
    }
    return { sha256: digest, bytes };
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
}

export function checkFailure(output) {
  const marker = output?.split(/\r?\n/).find((line) => line.startsWith("LAURIL_BACKUP_ERROR:"));
  const match = /^LAURIL_BACKUP_ERROR:(CONNECTION|PERMISSION|INVENTORY|VERSION):(connect|hello|process_id|build_info|list_collections|count_documents|list_indexes|orphan_check|commercial_sum|inventory_check|serialize_inventory)$/.exec(marker ?? "");
  return match ? { backupCode: match[1], backupOperation: match[2] } : null;
}

export function diagnostic(error, fallback) {
  const codes = ["CONFIG", "TOOLS", "CONFIRMATION", "RCLONE", "RESTORE_TARGET", "CONNECTION",
    "PERMISSION", "INVENTORY", "VERSION", "MONGODUMP", "BACKUP_VERIFICATION"];
  const operations = ["node", "mongodump", "mongorestore", "mongosh", "rclone", "connect", "hello", "process_id",
    "build_info", "list_collections", "count_documents", "list_indexes", "orphan_check",
    "commercial_sum", "inventory_check", "serialize_inventory"];
  const result = { errorCode: codes.includes(error?.backupCode) ? error.backupCode : fallback };
  if (operations.includes(error?.backupOperation)) result.errorOperation = error.backupOperation;
  return result;
}

async function snapshot(uri, name) {
  let output;
  try {
    output = await runTool("mongosh", ["--nodb", "--quiet", `--file=${checkScript}`], {
      BACKUP_CHECK_URI: uri, BACKUP_CHECK_DB: name,
    }, true);
  } catch (error) {
    const failure = checkFailure(error.capturedOutput);
    throw Object.assign(new Error("Falló el verificador MongoDB"), failure ?? { backupCode: "INVENTORY" });
  }
  const line = output.split(/\r?\n/).find((item) => item.startsWith("LAURIL_BACKUP_CHECK:"));
  if (!line) throw Object.assign(new Error("Inventario no disponible"), { backupCode: "INVENTORY" });
  try { return JSON.parse(line.slice("LAURIL_BACKUP_CHECK:".length)); }
  catch { throw Object.assign(new Error("Inventario inválido"), { backupCode: "INVENTORY" }); }
}

async function confirmReal(action = "leer Atlas y subir cifrado a Google Drive") {
  if (!process.stdin.isTTY) throw new Error("Se requiere confirmación interactiva");
  const input = createInterface({ input: process.stdin, output: process.stdout });
  input.on("SIGINT", () => interruption.abort());
  try {
    const answer = await input.question(`Operación REAL: ${action}. Escribí RESPALDAR LAURIL: `,
      { signal: interruption.signal });
    if (answer.trim() !== "RESPALDAR LAURIL") throw new Error("Operación cancelada");
  } finally { input.close(); }
}

async function confirmRestore() {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  input.on("SIGINT", () => interruption.abort());
  try {
    const answer = await input.question("Restauración REAL en MongoDB local aislado. Escribí RESTAURAR EN LOCAL: ",
      { signal: interruption.signal });
    if (answer.trim() !== "RESTAURAR EN LOCAL") throw new Error("Restauración cancelada");
  } finally { input.close(); }
}

async function checkLocalMongod(expectedIdentity) {
  if (process.platform !== "win32") throw new Error("La restauración A1 requiere Windows");
  const script = `$c=@(Get-NetTCPConnection -LocalPort ${restorePort} -State Listen -ErrorAction Stop); if ($c.Count -ne 1 -or $c[0].LocalAddress -ne '127.0.0.1') { exit 2 }; $p=Get-Process -Id $c[0].OwningProcess -ErrorAction Stop; if ($p.ProcessName -ne 'mongod') { exit 3 }; Write-Output $p.Id`;
  const identity = (await runTool("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {}, true)).trim();
  if (!/^\d+$/.test(identity) || (expectedIdentity && identity !== expectedIdentity)) {
    throw new Error("La identidad del MongoDB local cambió");
  }
  return identity;
}

async function createMongoConfig(file, uri) {
  await writeFile(file, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600, flag: "wx" });
}

async function runDump(configFile, archive) {
  await runTool("mongodump", [
    `--config=${configFile}`, `--db=${database}`, `--archive=${archive}`, "--gzip", "--quiet",
  ]);
}

async function manual() {
  process.umask(0o077);
  const root = path.join(process.env.LOCALAPPDATA || tmpdir(), "Lauril", "backup-runs");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(path.join(root, "run-"));
  const config = path.join(directory, "mongo.yml");
  const restoreConfig = path.join(directory, "restore.yml");
  const archive = path.join(directory, "backup.archive.gz");
  const downloaded = path.join(directory, "downloaded.archive.gz");
  const key = makeKey();
  const record = { startedAt: new Date().toISOString(), stage: "preflight", key };
  let restoreIdentity;
  let failureCode = "CONFIG";
  let finalized = false;
  const exitCleanup = () => {
    if (finalized) return;
    record.finishedAt = new Date().toISOString();
    record.result = record.stage === "restore_verified" ? "complete" :
      record.stage === "integrity_verified" ? "restore_pending" : "failed";
    try { writeFileSync(path.join(directory, "result.json"), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 }); }
    catch { /* La salida del proceso ya está en curso. */ }
    try { rmSync(config, { force: true }); } catch { /* idem */ }
    try { rmSync(restoreConfig, { force: true }); } catch { /* idem */ }
  };
  process.once("exit", exitCleanup);
  try {
    const uri = required("BACKUP_MONGODB_URI");
    validateSourceUri(uri);
    const restoreUri = process.env.BACKUP_RESTORE_URI?.trim();
    const restoreDb = restoreUri ? validateRestoreTarget(uri, restoreUri, required("BACKUP_RESTORE_ALLOWED_TARGET")) : null;
    if (required("BACKUP_CONSISTENCY_MODE") !== "writes_paused") {
      throw new Error("Se requiere BACKUP_CONSISTENCY_MODE=writes_paused");
    }
    failureCode = "TOOLS";
    await checkTools();
    failureCode = "CONFIRMATION";
    await confirmReal();
    failureCode = "RCLONE";
    await rclone(["lsjson", remote], true);
    failureCode = "CONFIG";
    await createMongoConfig(config, uri);
    if (restoreUri) {
      failureCode = "RESTORE_TARGET";
      restoreIdentity = await checkLocalMongod();
      await createMongoConfig(restoreConfig, restoreUri);
    }
    failureCode = "INVENTORY";
    const before = await snapshot(uri, database);
    failureCode = "VERSION";
    validateServerVersion(before.serverVersion);
    let restoreServerProcessId;
    if (restoreUri) {
      failureCode = "RESTORE_TARGET";
      const targetBefore = await snapshot(restoreUri, restoreDb);
      restoreServerProcessId = validateEmptyRestoreTarget(before, targetBefore);
    }
    failureCode = "MONGODUMP";
    await runDump(config, archive);
    record.stage = "dump_created";
    failureCode = "BACKUP_VERIFICATION";
    const { size } = await stat(archive);
    if (size === 0 || size > 5 * 1024 ** 3) throw new Error("Tamaño de respaldo inválido o superior a 5 GiB");
    const digest = await sha256(archive);
    record.bytes = size;
    record.sha256 = digest;
    const after = await snapshot(uri, database);
    if (after.serverVersion !== before.serverVersion) throw new Error("La versión del origen cambió durante el respaldo");
    record.sourceStable = compareSnapshots(before, after);
    if (!record.sourceStable) throw new Error("El inventario de origen cambió o contiene relaciones inválidas");
    const remoteInfo = await storeWithRclone(archive, key, rclone, () => { record.stage = "stored"; });
    if (Number(remoteInfo.Size) !== size) throw new Error("El tamaño remoto no coincide");
    await downloadFromStorage(key, downloaded, { sha256: digest, bytes: size });
    record.stage = "integrity_verified";
    if (!restoreUri) return;
    await confirmRestore();
    const restoreArgs = [`--config=${restoreConfig}`, `--archive=${downloaded}`, "--gzip",
      `--nsFrom=${database}.*`, `--nsTo=${restoreDb}.*`];
    await checkLocalMongod(restoreIdentity);
    await runTool("mongorestore", [...restoreArgs, "--dryRun"]);
    await checkLocalMongod(restoreIdentity);
    validateEmptyRestoreTarget(before, await snapshot(restoreUri, restoreDb), restoreServerProcessId);
    await runTool("mongorestore", restoreArgs);
    await checkLocalMongod(restoreIdentity);
    const restored = await snapshot(restoreUri, restoreDb);
    validateServerVersion(restored.serverVersion);
    if (restored.topology !== "standalone" || restored.serverProcessId !== restoreServerProcessId ||
        !compareSnapshots(before, restored)) {
      throw new Error("La restauración no coincide en topología, datos, índices o relaciones");
    }
    record.stage = "restore_verified";
    console.log(JSON.stringify({ status: record.stage, key, bytes: size, sha256: digest, record: path.join(directory, "result.json") }));
  } catch (error) {
    Object.assign(record, diagnostic(error, failureCode));
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    record.result = record.stage === "restore_verified" ? "complete" :
      record.stage === "integrity_verified" ? "restore_pending" : "failed";
    try {
      await writeFile(path.join(directory, "result.json"), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      console.log(JSON.stringify({ stage: record.stage, result: record.result, key, record: path.join(directory, "result.json") }));
    } finally {
      await rm(config, { force: true });
      await rm(restoreConfig, { force: true });
      if (record.stage === "restore_verified") {
        await rm(archive, { force: true });
        await rm(downloaded, { force: true });
      }
      finalized = true;
      process.off("exit", exitCleanup);
    }
  }
}

async function download(key, output, digest) {
  if (!/^[a-f0-9]{64}$/.test(digest ?? "")) throw new Error("Se requiere SHA-256 del registro original");
  await confirmReal("descargar un respaldo cifrado de Google Drive");
  const result = await downloadFromStorage(key, output, { sha256: digest });
  console.log(JSON.stringify({ status: "integrity_verified", key, output, ...result }));
}

async function list() {
  await confirmReal("listar respaldos cifrados en Google Drive");
  const items = JSON.parse(await rclone(["lsjson", remote + prefix, "--recursive"], true));
  for (const item of items) if (!item.IsDir) console.log(JSON.stringify({
    key: prefix + item.Path, bytes: item.Size, modifiedAt: item.ModTime,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.once("SIGINT", () => interruption.abort());
  process.once("SIGTERM", () => interruption.abort());
  loadDotenv({ path: fileURLToPath(new URL("../.env.backup.local", import.meta.url)), quiet: true });
  const [command, key, output, digest] = process.argv.slice(2);
  try {
    if (command === "manual" && !key) await manual();
    else if (command === "list" && !key) await list();
    else if (command === "download" && key && output && digest && !process.argv[6]) await download(key, output, digest);
    else throw new Error("Uso: node scripts/backup-mongodb.mjs manual | list | download <key> <ruta-absoluta> <sha256>");
  } catch (error) {
    // Errores de Rclone o MongoDB pueden contener URLs o credenciales.
    const safe = error instanceof Error && (/^Falta [A-Z_]+$/.test(error.message) || /^Falta (node|mongodump|mongorestore|mongosh|rclone);/.test(error.message));
    console.error(`Backup MongoDB: ${safe ? error.message : "falló; consultar el registro local y revisar configuración sin publicar secretos"}`);
    process.exitCode = interruption.signal.aborted ? 130 : 1;
  }
}
