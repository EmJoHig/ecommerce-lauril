import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "@/shared/domain/errors";
import type { ObjectStorage, ObjectUpload, StoredObject } from "../application/object-storage";

const extensions: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export class LocalObjectStorage implements ObjectStorage {
  async store(upload: ObjectUpload): Promise<StoredObject> {
    const extension = extensions[upload.contentType];
    if (!extension) throw new ValidationError("Formato de imagen no permitido.");
    if (upload.bytes.byteLength === 0 || upload.bytes.byteLength > 5 * 1024 * 1024) {
      throw new ValidationError("Cada imagen debe pesar entre 1 byte y 5 MB.");
    }
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
