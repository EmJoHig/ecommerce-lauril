import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { syncSettingsPermissions } from "../src/modules/auth/infrastructure/sync-settings-permissions";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI es obligatoria para sincronizar permisos.");

const prisma = new PrismaClient();
syncSettingsPermissions(prisma)
  .then(() => console.info("Permisos settings.read y settings.write sincronizados para ADMIN."))
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
