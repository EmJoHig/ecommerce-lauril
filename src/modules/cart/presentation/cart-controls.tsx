"use client";

import { startTransition, useActionState, useState } from "react";
import {
  clearCartAction,
  removeCartItemAction,
  updateCartItemAction,
} from "./cart-actions";
import { initialCartActionState } from "./cart-action-state";

export function CartQuantityControl({
  variantId,
  currentQuantity,
  maximum,
}: Readonly<{
  variantId: string;
  currentQuantity: number;
  maximum: number;
}>) {
  const [quantity, setQuantity] = useState(currentQuantity);
  const [state, action, pending] = useActionState(
    updateCartItemAction,
    initialCartActionState,
  );
  function submit(nextQuantity: number): void {
    const next = Math.min(Math.max(nextQuantity, 1), Math.max(maximum, 1));
    setQuantity(next);
    const data = new FormData();
    data.set("variantId", variantId);
    data.set("quantity", String(next));
    startTransition(() => action(data));
  }

  return (
    <div className="cart-quantity">
      <div>
        <button
          aria-label="Disminuir cantidad"
          disabled={pending || quantity <= 1}
          onClick={() => submit(quantity - 1)}
          type="button"
        >
          −
        </button>
        <form action={action}>
          <input name="variantId" type="hidden" value={variantId} />
          <input
            aria-label="Cantidad"
            disabled={pending}
            max={Math.max(maximum, 1)}
            min={1}
            name="quantity"
            onChange={(event) => setQuantity(Number(event.target.value))}
            type="number"
            value={quantity}
          />
          <button disabled={pending} type="submit">Actualizar</button>
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
      {state.status === "error" ? <p className="action-error" role="alert">{state.message}</p> : null}
    </div>
  );
}

export function RemoveCartItemButton({ variantId }: { variantId: string }) {
  const [state, action, pending] = useActionState(
    removeCartItemAction,
    initialCartActionState,
  );
  return (
    <form action={action} className="cart-remove-form">
      <input name="variantId" type="hidden" value={variantId} />
      <button disabled={pending} type="submit">{pending ? "Eliminando…" : "Eliminar"}</button>
      {state.status === "error" ? <span className="action-error" role="alert">{state.message}</span> : null}
    </form>
  );
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
