import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "./env";

type PrismaGlobal = typeof globalThis & {
  laurilPrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export function getPrisma(): PrismaClient {
  if (prismaGlobal.laurilPrisma) {
    return prismaGlobal.laurilPrisma;
  }

  const adapter = new PrismaPg({
    connectionString: getServerEnv().DATABASE_URL,
  });
  const client = new PrismaClient({ adapter });
  prismaGlobal.laurilPrisma = client;

  return client;
}
