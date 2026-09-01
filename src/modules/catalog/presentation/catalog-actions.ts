"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";
import { requireAdmin } from "@/modules/auth/presentation/session";
import type {
  CategoryFormInput,
  ProductFormInput,
} from "../application/catalog-admin-service";
import { getCatalogAdminService } from "../infrastructure/catalog-admin-composition";
import type { CatalogActionState } from "./catalog-action-state";

export async function saveProductAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const user = await requireAdmin("catalog.write");
  let productId: string;
  try {
    const raw = parseJsonFormField<ProductFormInput>(formData, "payload");
    const files = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length > 10) return actionError("Podés subir hasta 10 imágenes por vez.");
    if (files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      return actionError("La carga total de imágenes no puede superar 20 MB.");
    }
    const uploads = await Promise.all(
      files.map(async (file) => ({
        bytes: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        contentType: file.type,
      })),
    );
    productId = (await getCatalogAdminService().saveProduct(raw, uploads, user.id)).id;
  } catch (error) {
    return actionError(toActionMessage(error));
  }
  revalidatePath("/");
  revalidatePath("/productos");
  revalidatePath("/admin");
  revalidatePath("/admin/productos");
  redirect(`/admin/productos/${productId}/editar?guardado=1`);
}

export async function setProductStatusAction(formData: FormData): Promise<void> {
  const user = await requireAdmin("catalog.write");
  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  }).parse({ id: formData.get("id"), status: formData.get("status") });
  try {
    await getCatalogAdminService().setProductStatus(parsed.id, parsed.status, user.id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/admin/productos?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/productos");
  revalidatePath("/admin/productos");
}

export async function saveCategoryAction(
  _previous: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const user = await requireAdmin("catalog.write");
  let categoryId: string;
  try {
    const raw = parseJsonFormField<CategoryFormInput>(formData, "payload");
    categoryId = (await getCatalogAdminService().saveCategory(raw, user.id)).id;
  } catch (error) {
    return actionError(toActionMessage(error));
  }
  revalidatePath("/");
  revalidatePath("/productos");
  revalidatePath("/admin/categorias");
  redirect(`/admin/categorias/${categoryId}/editar?guardado=1`);
}

export async function setCategoryActiveAction(formData: FormData): Promise<void> {
  const user = await requireAdmin("catalog.write");
  const parsed = z.object({ id: z.uuid(), active: z.enum(["true", "false"]) }).parse({
    id: formData.get("id"),
    active: formData.get("active"),
  });
  try {
    await getCatalogAdminService().setCategoryActive(
      parsed.id,
      parsed.active === "true",
      user.id,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/admin/categorias?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/productos");
  revalidatePath("/admin/categorias");
}

function parseJsonFormField<T>(formData: FormData, name: string): T {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length > 200_000) {
    throw new Error("El formulario recibido no es válido.");
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error("No se pudo interpretar el formulario.");
  }
}

function toActionMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Datos inválidos.";
  if (error instanceof DomainError) return error.message;
  return "No se pudo guardar. Revisá los datos e intentá nuevamente.";
}

function actionError(message: string): CatalogActionState {
  return { status: "error", message };
}
