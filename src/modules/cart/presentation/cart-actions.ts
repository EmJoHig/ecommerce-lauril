"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import { formatMoney } from "@/shared/domain/money";
import { getCartService } from "../infrastructure/cart-composition";
import {
  createGuestCartToken,
  hashGuestCartToken,
} from "../domain/guest-cart-token";
import type { CartView } from "../application/cart-service";
import type { CartActionState } from "./cart-action-state";
import { getGuestCartToken, setGuestCartCookie } from "./guest-cart-cookie";

const itemSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce.number().int(),
});
const variantSchema = z.object({ variantId: z.uuid() });

export async function addCartItemAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = itemSchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return errorState("Seleccioná una variante y una cantidad válida.");

  try {
    const currentToken = await getGuestCartToken();
    const token = currentToken ?? createGuestCartToken();
    const cart = await getCartService().addItem({
      tokenHash: hashGuestCartToken(token),
      ...parsed.data,
    });
    await setGuestCartCookie(token);
    revalidateCart();
    return successState(cart, "Producto agregado al carrito.");
  } catch (error) {
    return errorState(actionMessage(error));
  }
}

export async function updateCartItemAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = itemSchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return errorState("Ingresá una cantidad válida.");
  try {
    const token = await requireGuestToken();
    const cart = await getCartService().updateItemQuantity({
      tokenHash: hashGuestCartToken(token),
      ...parsed.data,
    });
    await setGuestCartCookie(token);
    revalidateCart();
    return successState(cart, "Cantidad actualizada.");
  } catch (error) {
    return errorState(actionMessage(error));
  }
}

export async function removeCartItemAction(
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = variantSchema.safeParse({ variantId: formData.get("variantId") });
  if (!parsed.success) return errorState("El artículo seleccionado no es válido.");
  try {
    const token = await requireGuestToken();
    const cart = await getCartService().removeItem(
      hashGuestCartToken(token),
      parsed.data.variantId,
    );
    await setGuestCartCookie(token);
    revalidateCart();
    return successState(cart, "Producto eliminado.");
  } catch (error) {
    return errorState(actionMessage(error));
  }
}

export async function clearCartAction(
  _previous: CartActionState,
  _formData: FormData,
): Promise<CartActionState> {
  void _previous;
  void _formData;
  try {
    const token = await requireGuestToken();
    const cart = await getCartService().clearCart(hashGuestCartToken(token));
    await setGuestCartCookie(token);
    revalidateCart();
    return successState(cart, "Carrito vaciado.");
  } catch (error) {
    return errorState(actionMessage(error));
  }
}

async function requireGuestToken(): Promise<string> {
  const token = await getGuestCartToken();
  if (!token) throw new DomainError("No se encontró un carrito activo.");
  return token;
}

function successState(cart: CartView, message: string): CartActionState {
  return {
    status: "success",
    message,
    itemCount: cart.itemCount,
    subtotal: formatMoney(cart.subtotalInCents),
    items: cart.items.map((item) => ({
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: formatMoney(item.unitPriceInCents),
    })),
  };
}

function errorState(message: string): CartActionState {
  return {
    status: "error",
    message,
    itemCount: 0,
    subtotal: "$ 0,00",
    items: [],
  };
}

function actionMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Los datos del carrito no son válidos.";
  }
  if (error instanceof DomainError) return error.message;
  return "No se pudo actualizar el carrito. Volvé a intentarlo.";
}

function revalidateCart(): void {
  revalidatePath("/carrito");
  revalidatePath("/", "layout");
}
