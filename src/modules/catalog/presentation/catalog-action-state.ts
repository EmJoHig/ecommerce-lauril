export type CatalogActionState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

export const initialCatalogActionState: CatalogActionState = {
  status: "idle",
  message: "",
};
