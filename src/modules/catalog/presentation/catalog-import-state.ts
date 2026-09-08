export type CatalogImportActionState = Readonly<{
  status: "idle" | "preview" | "error" | "success";
  message?: string;
  fileName?: string;
  summary?: Readonly<{
    products: number;
    categories: string[];
    fragrances: string[];
  }>;
  errors?: ReadonlyArray<Readonly<{ row: number; reason: string }>>;
  result?: Readonly<{
    created: number;
    updated: number;
    products: number;
    categories: number;
    fragrances: number;
  }>;
}>;

export const initialCatalogImportState: CatalogImportActionState = { status: "idle" };
