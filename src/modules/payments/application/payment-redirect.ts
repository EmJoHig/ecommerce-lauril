import { ValidationError } from "@/shared/domain/errors";

export function secureCheckoutUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("El proveedor devolvió una URL de checkout inválida.");
  }
  if (url.protocol !== "https:") {
    throw new ValidationError("El proveedor devolvió una URL de checkout insegura.");
  }
  return url.toString();
}
