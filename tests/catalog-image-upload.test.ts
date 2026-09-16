import { describe, expect, it } from "vitest";
import { validateCatalogImageUpload } from "@/modules/catalog/infrastructure/catalog-image-upload";
import { ValidationError } from "@/shared/domain/errors";

function validate(bytes: number[] | Uint8Array, contentType: string): string {
  return validateCatalogImageUpload({
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    fileName: "imagen",
    contentType,
  });
}

describe("validateCatalogImageUpload", () => {
  it("acepta JPEG con firma válida", () => {
    expect(validate([0xff, 0xd8, 0xff, 0xe0], "image/jpeg")).toBe("jpg");
  });

  it("acepta PNG con la firma estándar completa", () => {
    expect(validate([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png")).toBe("png");
  });

  it("acepta WebP con RIFF y WEBP en sus posiciones", () => {
    expect(validate([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"))
      .toBe("webp");
  });

  it("acepta GIF87a y GIF89a", () => {
    expect(validate([0x47, 0x49, 0x46, 0x38, 0x37, 0x61], "image/gif")).toBe("gif");
    expect(validate([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif")).toBe("gif");
  });

  it("acepta AVIF o AVIS como major brand o compatible brand", () => {
    expect(validate([
      0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
    ], "image/avif")).toBe("avif");
    expect(validate([
      0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0, 0x61, 0x76, 0x69, 0x73,
    ], "image/avif")).toBe("avif");
  });

  it("rechaza bytes de otro formato aunque el MIME esté permitido", () => {
    expect(() => validate([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/jpeg"))
      .toThrow(ValidationError);
  });

  it("rechaza contenido arbitrario o HTML disfrazado de imagen", () => {
    expect(() => validate([1, 2, 3, 4], "image/jpeg")).toThrow(ValidationError);
    expect(() => validate(Array.from(new TextEncoder().encode("<html>no es una imagen</html>")), "image/png"))
      .toThrow(ValidationError);
  });

  it("rechaza RIFF si no identifica un WebP", () => {
    expect(() => validate([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20,
    ], "image/webp")).toThrow(ValidationError);
  });

  it("rechaza ISO BMFF sin brand AVIF/AVIS o con ftyp incoherente", () => {
    expect(() => validate([
      0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x6d, 0x70, 0x34, 0x32,
    ], "image/avif")).toThrow(ValidationError);
    expect(() => validate([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
    ], "image/avif")).toThrow(ValidationError);
  });

  it("conserva el rechazo de imágenes vacías o mayores a 5 MB", () => {
    expect(() => validate([], "image/png")).toThrow("Cada imagen debe pesar entre 1 byte y 5 MB.");
    expect(() => validate(new Uint8Array(5 * 1024 * 1024 + 1), "image/png"))
      .toThrow("Cada imagen debe pesar entre 1 byte y 5 MB.");
  });
});
