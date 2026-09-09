"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState } from "react";
import {
  clearCartAction,
  removeCartItemAction,
  updateCartItemAction,
} from "./cart-actions";
import { initialCartActionState } from "./cart-action-state";
import { cartUpdatedEvent } from "./cart-events";

export function CartQuantityControl({
  variantId,
  currentQuantity,
  maximum,
  compact = false,
}: Readonly<{
  variantId: string;
  currentQuantity: number;
  maximum: number;
  compact?: boolean;
}>) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(currentQuantity);
  const [state, action, pending] = useActionState(
    updateCartItemAction,
    initialCartActionState,
  );
  useEffect(() => {
    if (state.status !== "success") return;
    window.dispatchEvent(new Event(cartUpdatedEvent));
    router.refresh();
  }, [router, state]);
  function submit(nextQuantity: number): void {
    const next = Math.min(Math.max(nextQuantity, 1), Math.max(maximum, 1));
    setQuantity(next);
    const data = new FormData();
    data.set("variantId", variantId);
    data.set("quantity", String(next));
    startTransition(() => action(data));
  }

  return (
    <div aria-busy={pending} className={compact ? "cart-quantity cart-quantity--compact" : "cart-quantity"}>
      <div>
        <button
          aria-label="Disminuir cantidad"
          disabled={pending || quantity <= 1}
          onClick={() => submit(quantity - 1)}
          type="button"
        >
          −
        </button>
        <form action={action} className={compact ? "cart-quantity__compact-form" : undefined}>
          <input name="variantId" type="hidden" value={variantId} />
          <input
            aria-label="Cantidad"
            disabled={pending}
            max={Math.max(maximum, 1)}
            min={1}
            name="quantity"
            onChange={(event) => setQuantity(Number(event.target.value))}
            readOnly={compact}
            type="number"
            value={quantity}
          />
          {compact ? null : <button disabled={pending} type="submit">Actualizar</button>}
        </form>
        <button
          aria-label="Aumentar cantidad"
          disabled={pending || maximum < 1 || quantity >= maximum}
          onClick={() => submit(quantity + 1)}
          type="button"
        >
          +
        </button>
      </div>
      {pending ? <span className="cart-quantity__pending" role="status">Actualizando…</span> : null}
      {state.status === "error" ? <p className="action-error" role="alert">{state.message}</p> : null}
    </div>
  );
}

export function RemoveCartItemButton({ variantId, iconOnly = false }: { variantId: string; iconOnly?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    removeCartItemAction,
    initialCartActionState,
  );
  useEffect(() => {
    if (state.status !== "success") return;
    window.dispatchEvent(new Event(cartUpdatedEvent));
    router.refresh();
  }, [router, state]);
  return (
    <form action={action} className="cart-remove-form">
      <input name="variantId" type="hidden" value={variantId} />
      <button aria-label={iconOnly ? "Eliminar producto del carrito" : undefined} className={iconOnly ? "cart-remove-button cart-remove-button--icon" : "cart-remove-button"} disabled={pending} type="submit">{iconOnly ? <TrashIcon /> : pending ? "Eliminando…" : "Eliminar"}</button>
      {state.status === "error" ? <span className="action-error" role="alert">{state.message}</span> : null}
    </form>
  );
}

function TrashIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"/></svg>;
}

export function ClearCartButton() {
  const [state, action, pending] = useActionState(
    clearCartAction,
    initialCartActionState,
  );
  return (
    <form action={action} className="clear-cart-form">
      <button className="button button--secondary" disabled={pending} type="submit">
        {pending ? "Vaciando…" : "Vaciar carrito"}
      </button>
      {state.status === "error" ? <span className="action-error" role="alert">{state.message}</span> : null}
    </form>
  );
}
