import "server-only";

import { getPrisma } from "./prisma";

export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
