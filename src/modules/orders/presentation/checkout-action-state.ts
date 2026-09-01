export type CheckoutActionState = Readonly<{
  status: "idle" | "error";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
}>;

export const initialCheckoutActionState: CheckoutActionState = { status: "idle", message: "" };
