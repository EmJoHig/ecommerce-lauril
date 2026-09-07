import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage, ObjectUpload, StoredObject } from "../application/object-storage";
import { validateCatalogImageUpload } from "./catalog-image-upload";

export class LocalObjectStorage implements ObjectStorage {
  async store(upload: ObjectUpload): Promise<StoredObject> {
    const extension = validateCatalogImageUpload(upload);
    const fileName = `${randomUUID()}.${extension}`;
    const directory = path.join(process.cwd(), "public", "uploads", "catalog");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, fileName), upload.bytes, { flag: "wx" });
    return {
      objectKey: `local/catalog/${fileName}`,
      url: `/uploads/catalog/${fileName}`,
    };
  }

  async delete(objectKey: string): Promise<void> {
    if (!objectKey.startsWith("local/catalog/")) return;
    const fileName = path.basename(objectKey);
    try {
      await unlink(path.join(process.cwd(), "public", "uploads", "catalog", fileName));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}
