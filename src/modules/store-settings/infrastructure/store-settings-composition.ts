import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import { getPrisma } from "@/shared/infrastructure/prisma";
import { StoreSettingsService } from "../application/store-settings-service";
import { PrismaStoreSettingsRepository } from "./prisma-store-settings-repository";

export function getStoreSettingsService(): StoreSettingsService {
  return new StoreSettingsService(new PrismaStoreSettingsRepository(getPrisma()));
}

export const getPublicStoreSettings = cache(async () => {
  await connection();
  return getStoreSettingsService().get();
});
