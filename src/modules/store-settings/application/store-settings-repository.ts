import type { StoreSettings } from "../domain/store-settings";

export interface StoreSettingsRepository {
  get(): Promise<StoreSettings>;
  update(settings: StoreSettings, actorUserId: string): Promise<StoreSettings>;
}
