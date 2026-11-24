import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { syncWithdrawalPermissions } from "../src/modules/auth/infrastructure/sync-withdrawal-permissions";
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI es obligatoria.");
const prisma = new PrismaClient();
syncWithdrawalPermissions(prisma).then(() => console.info("Permisos y rol de arrepentimientos sincronizados.")).catch(() => { console.error("No se pudo sincronizar el rol de arrepentimientos. Revisar configuración y permisos."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
