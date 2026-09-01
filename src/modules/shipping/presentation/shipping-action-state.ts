export type ShippingActionState = Readonly<{ status: "idle" | "error"; message: string }>;
export const initialShippingActionState: ShippingActionState = { status: "idle", message: "" };
