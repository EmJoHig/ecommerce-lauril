export type OrderAdminActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export const initialOrderAdminActionState: OrderAdminActionState = {
  status: "idle",
  message: "",
};
