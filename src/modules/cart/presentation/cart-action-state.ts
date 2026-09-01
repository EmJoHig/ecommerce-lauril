export type CartActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  itemCount: number;
  subtotal: string;
  items: ReadonlyArray<{
    variantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitPrice: string;
  }>;
}>;

export const initialCartActionState: CartActionState = {
  status: "idle",
  message: "",
  itemCount: 0,
  subtotal: "$ 0,00",
  items: [],
};
