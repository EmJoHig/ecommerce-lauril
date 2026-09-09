import "server-only";

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

  getServerEnv();
  const client = new PrismaClient();
  prismaGlobal.laurilPrisma = client;

  return client;
}
