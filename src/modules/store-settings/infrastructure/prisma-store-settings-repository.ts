import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { StoreSettingsRepository } from "../application/store-settings-repository";
import type { StoreSettings } from "../domain/store-settings";

const STORE_SETTINGS_ID = 1;

export class PrismaStoreSettingsRepository implements StoreSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<StoreSettings> {
    return mapStoreSettings(await this.prisma.storeSettings.findUniqueOrThrow({ where: { id: STORE_SETTINGS_ID } }));
  }

  update(settings: StoreSettings, actorUserId: string): Promise<StoreSettings> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.storeSettings.update({ where: { id: STORE_SETTINGS_ID }, data: settings });
      await tx.auditLog.create({
        data: { actorUserId, action: "store_settings.update", entityType: "StoreSettings", entityId: String(STORE_SETTINGS_ID) },
      });
      return mapStoreSettings(updated);
    });
  }
}

function mapStoreSettings(row: Prisma.StoreSettingsGetPayload<object>): StoreSettings {
  return {
    storeName: row.storeName,
    publicEmail: row.publicEmail,
    phone: row.phone,
    whatsapp: row.whatsapp,
    businessAddress: row.businessAddress,
    instagramUrl: row.instagramUrl,
    facebookUrl: row.facebookUrl,
    publicDescription: row.publicDescription,
  };
}
