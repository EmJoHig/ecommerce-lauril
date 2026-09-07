import { z } from "zod";
import { validateStoreSettings, type StoreSettingsInput } from "../domain/store-settings";
import type { StoreSettingsRepository } from "./store-settings-repository";

export class StoreSettingsService {
  constructor(private readonly repository: StoreSettingsRepository) {}

  get() {
    return this.repository.get();
  }

  update(input: StoreSettingsInput, actorUserId: string) {
    return this.repository.update(validateStoreSettings(input), z.uuid().parse(actorUserId));
  }
}
