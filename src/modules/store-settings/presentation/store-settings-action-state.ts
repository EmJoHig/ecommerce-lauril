export type StoreSettingsActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export const initialStoreSettingsActionState: StoreSettingsActionState = { status: "idle", message: "" };
