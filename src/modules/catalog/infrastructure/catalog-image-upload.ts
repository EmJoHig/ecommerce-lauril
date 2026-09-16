import { ValidationError } from "@/shared/domain/errors";
import type { ObjectUpload } from "../application/object-storage";

const formats: Readonly<Record<string, Readonly<{
  extension: string;
  hasValidSignature(bytes: Uint8Array): boolean;
}>>> = {
  "image/jpeg": { extension: "jpg", hasValidSignature: isJpeg },
  "image/png": { extension: "png", hasValidSignature: isPng },
  "image/webp": { extension: "webp", hasValidSignature: isWebp },
  "image/avif": { extension: "avif", hasValidSignature: isAvif },
  "image/gif": { extension: "gif", hasValidSignature: isGif },
};

export function validateCatalogImageUpload(upload: ObjectUpload): string {
  const format = formats[upload.contentType];
  if (!format) throw new ValidationError("Formato de imagen no permitido.");
  if (upload.bytes.byteLength === 0 || upload.bytes.byteLength > 5 * 1024 * 1024) {
    throw new ValidationError("Cada imagen debe pesar entre 1 byte y 5 MB.");
  }
  if (!format.hasValidSignature(upload.bytes)) {
    throw new ValidationError("El contenido no coincide con el formato de imagen declarado.");
  }
  return format.extension;
}

function hasBytesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return hasBytesAt(bytes, 0, [0xff, 0xd8, 0xff]);
}

function isPng(bytes: Uint8Array): boolean {
  return hasBytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isGif(bytes: Uint8Array): boolean {
  return hasBytesAt(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
    || hasBytesAt(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12
    && hasBytesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46])
    && hasBytesAt(bytes, 8, [0x57, 0x45, 0x42, 0x50]);
}

function isAvif(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16 || !hasBytesAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) return false;

  const boxSize = readUint32BigEndian(bytes);
  if (boxSize < 16 || boxSize > bytes.byteLength || (boxSize - 16) % 4 !== 0) return false;
  if (isAvifBrand(bytes, 8)) return true;

  for (let offset = 16; offset < boxSize; offset += 4) {
    if (isAvifBrand(bytes, offset)) return true;
  }
  return false;
}

function readUint32BigEndian(bytes: Uint8Array): number {
  return bytes[0]! * 0x1000000 + bytes[1]! * 0x10000 + bytes[2]! * 0x100 + bytes[3]!;
}

function isAvifBrand(bytes: Uint8Array, offset: number): boolean {
  return hasBytesAt(bytes, offset, [0x61, 0x76, 0x69, 0x66])
    || hasBytesAt(bytes, offset, [0x61, 0x76, 0x69, 0x73]);
}
