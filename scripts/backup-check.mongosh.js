// Solo lectura. Ejecutado con mongosh --nodb y URI en el entorno del proceso.
async function checked(operation, fallback, action) {
  try { return await action(); }
  catch (error) {
    const code = error?.code;
    const name = error?.name;
    const category = code === 13 || code === 18 || name === "MongoServerError" &&
      (error?.codeName === "Unauthorized" || error?.codeName === "AuthenticationFailed") ? "PERMISSION" :
      [6, 7, 89, 91, 9001].includes(code) ||
      ["MongoNetworkError", "MongoServerSelectionError", "MongoNetworkTimeoutError"].includes(name) ? "CONNECTION" : fallback;
    print("LAURIL_BACKUP_ERROR:" + category + ":" + operation);
    exit(1);
  }
}
(async () => {
const connection = await checked("connect", "CONNECTION", () => new Mongo(process.env.BACKUP_CHECK_URI));
const database = await checked("connect", "CONNECTION", () => connection.getDB(process.env.BACKUP_CHECK_DB));
const hello = await checked("hello", "CONNECTION", () => database.adminCommand({ hello: 1 }));
const topology = hello.msg === "isdbgrid" ? "sharded" : hello.setName ? "replica_set" : "standalone";
const serverVersion = (await checked("build_info", "VERSION", () => database.adminCommand({ buildInfo: 1 }))).version;
const serverProcessId = topology === "standalone" ? await checked("process_id", "INVENTORY", () => {
  const id = hello.topologyVersion?.processId?.toString?.();
  if (!/^[a-f0-9]{24}$/.test(id ?? "")) throw new Error("Identificador de proceso inválido");
  return id;
}) : null;
const names = await checked("list_collections", "INVENTORY", async () =>
  (await database.getCollectionNames()).filter((name) => !name.startsWith("system.")).sort());
const collections = {};

for (const name of names) {
  const collection = database.getCollection(name);
  collections[name] = {
    count: await checked("count_documents", "INVENTORY", () => collection.countDocuments({})),
    indexes: await checked("list_indexes", "INVENTORY", async () => (await collection.getIndexes()).map((index) => ({
      name: index.name,
      key: index.key,
      unique: index.unique === true,
      partialFilterExpression: index.partialFilterExpression ?? null,
      expireAfterSeconds: index.expireAfterSeconds ?? null,
      sparse: index.sparse === true,
      collation: index.collation ?? null,
      hidden: index.hidden === true,
    })).sort((a, b) => a.name.localeCompare(b.name))),
  };
}

async function orphans(childName, parentName, childField) {
  if (!names.includes(childName)) return 0;
  return await checked("orphan_check", "INVENTORY", async () => (await database.getCollection(childName).aggregate([
    { $match: { [childField]: { $ne: null } } },
    { $lookup: { from: parentName, localField: childField, foreignField: "_id", as: "parent" } },
    { $match: { parent: { $size: 0 } } },
    { $count: "value" },
  ]).toArray())[0]?.value ?? 0);
}

const problems = {
  orderItemsWithoutOrder: await orphans("order_items", "orders", "order_id"),
  paymentAttemptsWithoutOrder: await orphans("payment_attempts", "orders", "order_id"),
  paymentRefundsWithoutAttempt: await orphans("payment_refunds", "payment_attempts", "payment_attempt_id"),
  paymentEventsWithoutAttempt: await orphans("payment_events", "payment_attempts", "payment_attempt_id"),
  inventoryWithoutVariant: await orphans("inventory", "product_variants", "variant_id"),
  movementsWithoutInventory: await orphans("inventory_movements", "inventory", "inventory_id"),
};

// Sumas comerciales sin datos personales: detectan cambios compensados de conteo.
async function sum(name, field) {
  if (!names.includes(name)) return "0";
  return await checked("commercial_sum", "INVENTORY", async () => {
    const result = (await database.getCollection(name).aggregate([
      { $group: { _id: null, value: { $sum: `$${field}` } } },
    ]).toArray())[0];
    return result ? result.value.toString() : "0";
  });
}

const commercial = {
  orderTotalInCents: await sum("orders", "total_in_cents"),
  orderItemSubtotalInCents: await sum("order_items", "subtotal_in_cents"),
  paymentAttemptAmountInCents: await sum("payment_attempts", "amount_in_cents"),
  stockOnHand: await sum("inventory", "stock_on_hand"),
  stockReserved: await sum("inventory", "stock_reserved"),
};

if (names.includes("inventory")) {
  problems.invalidInventory = await checked("inventory_check", "INVENTORY", () => database.getCollection("inventory").countDocuments({
    $expr: { $or: [
      { $lt: ["$stock_on_hand", 0] },
      { $lt: ["$stock_reserved", 0] },
      { $gt: ["$stock_reserved", "$stock_on_hand"] },
    ] },
  }));
}

const inventory = await checked("serialize_inventory", "INVENTORY", () =>
  JSON.stringify({ topology, serverVersion, serverProcessId, collections, problems, commercial }));
print(`LAURIL_BACKUP_CHECK:${inventory}`);

})();
