import "server-only";

import { getPrisma } from "./prisma";

export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await getPrisma().$runCommandRaw({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
