export type CustomerActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
  developmentPreviewUrl?: string | null;
}>;

export const initialCustomerActionState: CustomerActionState = {
  status: "idle",
  message: "",
};
