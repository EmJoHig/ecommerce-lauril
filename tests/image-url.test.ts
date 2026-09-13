import { describe, expect, it } from "vitest";
import { getImageProps } from "next/image";
import { isLocalUploadUrl } from "@/shared/presentation/image-url";

describe("isLocalUploadUrl", () => {
  it("detecta solamente imágenes servidas desde /uploads/", () => {
    for (const url of [
      "/uploads/catalog/producto.png",
      "/uploads/otra-carpeta/imagen.webp",
    ]) {
      expect(isLocalUploadUrl(url)).toBe(true);
    }
  });

  it("mantiene optimizables las demás URLs", () => {
    for (const url of [
      null,
      undefined,
      "/uploads",
      "uploads/catalog/producto.png",
      "/product-placeholder.svg",
      "/home/producto.png",
      "https://assets.example.com/catalog/producto.png",
    ]) {
      expect(isLocalUploadUrl(url)).toBe(false);
    }
  });

  it("mantiene directa la URL local al generar las props de Next Image", () => {
    const src = "/uploads/catalog/producto.png";
    const { props } = getImageProps({
      alt: "Producto",
      height: 100,
      src,
      unoptimized: isLocalUploadUrl(src),
      width: 100,
    });

    expect(props.src).toBe(src);
    expect(props.srcSet).toBeUndefined();
  });

  it("conserva el optimizador para una imagen estática normal", () => {
    const src = "/home/producto.png";
    const { props } = getImageProps({
      alt: "Producto",
      height: 100,
      src,
      unoptimized: isLocalUploadUrl(src),
      width: 100,
    });

    expect(props.src).toContain("/_next/image?url=%2Fhome%2Fproducto.png");
    expect(props.srcSet).toContain("/_next/image?url=%2Fhome%2Fproducto.png");
  });
});
