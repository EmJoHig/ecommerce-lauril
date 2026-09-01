export type InventoryActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export const initialInventoryActionState: InventoryActionState = {
  status: "idle",
  message: "",
};
