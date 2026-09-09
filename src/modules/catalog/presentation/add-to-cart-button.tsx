"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { addCartItemAction } from "@/modules/cart/presentation/cart-actions";
import { initialCartActionState } from "@/modules/cart/presentation/cart-action-state";
import { cartOpenEvent, cartUpdatedEvent } from "@/modules/cart/presentation/cart-events";

export function AddToCartButton({ variantId }: { variantId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addCartItemAction, initialCartActionState);

  useEffect(() => {
    if (state.status !== "success") return;
    window.dispatchEvent(new Event(cartUpdatedEvent));
    window.dispatchEvent(new Event(cartOpenEvent));
    router.refresh();
  }, [router, state]);

  return (
    <form action={action} className="product-card__add-form">
      <input name="variantId" type="hidden" value={variantId} />
      <input name="quantity" type="hidden" value="1" />
      <button className="product-card__add" disabled={pending} type="submit">
        <CartIcon /> {pending ? "Agregando…" : "Agregar al carrito"}
      </button>
      {state.status === "error" ? <span className="product-card__error" role="alert">{state.message}</span> : null}
    </form>
  );
}

function CartIcon() {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20.4 8H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><circle cx="10" cy="20" fill="currentColor" r="1.4"/><circle cx="18" cy="20" fill="currentColor" r="1.4"/></svg>;
}
