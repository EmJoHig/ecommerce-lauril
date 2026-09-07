export type AdminActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export const initialAdminActionState: AdminActionState = { status: "idle", message: "" };
