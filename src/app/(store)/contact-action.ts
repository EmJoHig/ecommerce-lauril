"use server";

import { z } from "zod";
import { createEmailSender } from "@/modules/customers/infrastructure/email-sender-composition";
import { getServerEnv } from "@/shared/infrastructure/env";

export type ContactActionState = Readonly<{ status: "idle" | "success" | "error"; message: string }>;

const contactSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre.").max(100).regex(/^[^\r\n]+$/, "El nombre no es válido."),
  email: z.string().trim().email("Ingresá un email válido.").max(160),
  phone: z.string().trim().max(40).optional().transform((value) => value || null),
  message: z.string().trim().min(10, "El mensaje debe tener al menos 10 caracteres.").max(2000),
  website: z.string().max(0),
});

export async function sendContactMessageAction(_: ContactActionState, formData: FormData): Promise<ContactActionState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    website: formData.get("website"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Revisá los datos ingresados." };

  try {
    await createEmailSender(getServerEnv()).sendContactMessage(parsed.data);
    return { status: "success", message: "Mensaje enviado. Te responderemos a la brevedad." };
  } catch {
    return { status: "error", message: "No pudimos enviar el mensaje. Intentá nuevamente." };
  }
}
