"use client";

import Image from "next/image";
import { useState } from "react";
import { isLocalUploadUrl } from "./image-url";

export function ProductImage({ src, alt, sizes, priority = false }: Readonly<{
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
}>) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = src && failedSrc !== src ? src : "/product-placeholder.svg";
  return <Image
    alt={alt}
    fill
    onError={() => setFailedSrc(src)}
    priority={priority}
    sizes={sizes}
    src={currentSrc}
    unoptimized={isLocalUploadUrl(currentSrc)}
  />;
}
