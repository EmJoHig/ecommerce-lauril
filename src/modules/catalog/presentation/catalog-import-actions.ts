"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { DomainError } from "@/shared/domain/errors";
import { getCatalogImportService } from "../infrastructure/catalog-import-composition";
import { parseCatalogImportWorkbook } from "../infrastructure/catalog-import-workbook";
import type { CatalogImportActionState } from "./catalog-import-state";

const MAX_FILE_SIZE = 900 * 1024;

export async function catalogImportAction(formData: FormData): Promise<CatalogImportActionState> {
  const user = await requireAdmin("catalog.write");
  try {
    const mode = z.enum(["preview", "confirm"]).parse(formData.get("mode"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return actionError("Seleccioná un archivo .xlsx.");
    if (!file.name.toLocaleLowerCase("es-AR").endsWith(".xlsx")) return actionError("El archivo debe tener extensión .xlsx.");
    if (file.size > MAX_FILE_SIZE) return actionError("El archivo no puede superar 900 KB.");

    const source = await parseCatalogImportWorkbook(new Uint8Array(await file.arrayBuffer()));
    const service = getCatalogImportService();
    const preview = service.preview(source);
    if (preview.errors.length > 0) {
      return {
        status: "error",
        message: "El archivo contiene errores. Corregilos antes de importar.",
        fileName: file.name,
        summary: {
          products: preview.products,
          categories: preview.categories,
          fragrances: preview.fragrances,
        },
        errors: preview.errors.slice(0, 200),
      };
    }
    if (mode === "preview") {
      return {
        status: "preview",
        message: "Archivo válido. Revisá el resumen y confirmá la importación.",
        fileName: file.name,
        summary: {
          products: preview.products,
          categories: preview.categories,
          fragrances: preview.fragrances,
        },
      };
    }

    const result = await service.import(source, user.id);
    revalidatePath("/");
    revalidatePath("/productos");
    revalidatePath("/admin");
    revalidatePath("/admin/productos");
    return {
      status: "success",
      message: "Importación completada.",
      fileName: file.name,
      result,
    };
   } catch (error) {
    console.error("[catalog-import] Error al importar catálogo", error);
    return actionError(toActionMessage(error));
  }
}

function toActionMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }

  if (error instanceof DomainError) {
    return error.message;
  }

  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    return `Error al guardar la importación: ${error.message}`;
  }

  return "No se pudo guardar la importación en la base de datos.";
}

function actionError(message: string): CatalogImportActionState {
  return { status: "error", message };
}
