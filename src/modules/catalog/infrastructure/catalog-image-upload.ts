import { ValidationError } from "@/shared/domain/errors";
import type { ObjectUpload } from "../application/object-storage";

const extensions: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export function validateCatalogImageUpload(upload: ObjectUpload): string {
  const extension = extensions[upload.contentType];
  if (!extension) throw new ValidationError("Formato de imagen no permitido.");
  if (upload.bytes.byteLength === 0 || upload.bytes.byteLength > 5 * 1024 * 1024) {
    throw new ValidationError("Cada imagen debe pesar entre 1 byte y 5 MB.");
  }
  return extension;
}
