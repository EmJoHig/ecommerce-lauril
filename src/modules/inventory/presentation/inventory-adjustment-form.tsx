"use client";

import { useActionState } from "react";
import { initialInventoryActionState } from "./inventory-action-state";
import { adjustInventoryAction } from "./inventory-actions";
import { PendingButton } from "@/modules/catalog/presentation/pending-button";

export function InventoryAdjustmentForm({ inventoryId }: { inventoryId: string }) {
  const [state, action] = useActionState(adjustInventoryAction, initialInventoryActionState);
  return (
    <form action={action} className="inline-adjustment">
      <input name="inventoryId" type="hidden" value={inventoryId} />
      <input aria-label="Variación" name="quantity" placeholder="+5 o -2" required type="number" />
      <input aria-label="Motivo" maxLength={500} minLength={3} name="reason" placeholder="Motivo del ajuste" required />
      <PendingButton className="button button--small">Ajustar</PendingButton>
      {state.message ? <small className={state.status === "error" ? "action-error" : "action-success"}>{state.message}</small> : null}
    </form>
  );
}
