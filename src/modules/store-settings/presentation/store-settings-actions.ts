"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/modules/auth/presentation/session";
import { DomainError } from "@/shared/domain/errors";
import { getStoreSettingsService } from "../infrastructure/store-settings-composition";
import type { StoreSettingsActionState } from "./store-settings-action-state";

const formSchema = z.object({
  storeName: z.string(),
  publicEmail: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  businessAddress: z.string(),
  instagramUrl: z.string(),
  facebookUrl: z.string(),
  publicDescription: z.string(),
});

export async function saveStoreSettingsAction(
  _previous: StoreSettingsActionState,
  formData: FormData,
): Promise<StoreSettingsActionState> {
  const admin = await requireAdmin();
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revisá los datos comerciales ingresados." };

  try {
    await getStoreSettingsService().update(parsed.data, admin.id);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof DomainError ? error.message : "No se pudo guardar la configuración.",
    };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/configuracion");
  return { status: "success", message: "La configuración comercial se guardó correctamente." };
}
