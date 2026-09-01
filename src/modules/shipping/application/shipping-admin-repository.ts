import type { ShippingMethodDraft, ShippingMethodState } from "../domain/shipping";

export type ShippingMethodWrite = ShippingMethodDraft;

export interface ShippingAdminRepository {
  listAll(): Promise<ReadonlyArray<ShippingMethodState>>;
  findById(id: string): Promise<ShippingMethodState | null>;
  create(input: ShippingMethodWrite, actorUserId: string): Promise<ShippingMethodState>;
  update(id: string, input: ShippingMethodWrite, actorUserId: string): Promise<ShippingMethodState | null>;
  setActive(id: string, isActive: boolean, actorUserId: string): Promise<boolean>;
}
