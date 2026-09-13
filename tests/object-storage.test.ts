import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LocalObjectStorage } from "@/modules/catalog/infrastructure/local-object-storage";
import { createObjectStorage } from "@/modules/catalog/infrastructure/object-storage-composition";
import { S3ObjectStorage } from "@/modules/catalog/infrastructure/s3-object-storage";
import { ValidationError } from "@/shared/domain/errors";

vi.mock("server-only", () => ({}));

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "catalog",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  publicBaseUrl: "https://assets.example.com/",
};

function createFakeClient() {
  const commands: Array<PutObjectCommand | DeleteObjectCommand> = [];
  return {
    commands,
    client: {
      async send(command: PutObjectCommand | DeleteObjectCommand) {
        commands.push(command);
        return {};
      },
    },
  };
}

describe("ObjectStorage", () => {
  it("almacena una imagen en S3 y devuelve su URL pública", async () => {
    const fake = createFakeClient();
    const storage = new S3ObjectStorage(config, fake.client);

    const stored = await storage.store({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "producto.png",
      contentType: "image/png",
    });

    expect(stored.objectKey).toMatch(/^catalog\/[0-9a-f-]+\.png$/);
    expect(stored.url).toBe(`https://assets.example.com/${stored.objectKey}`);
    expect(fake.commands).toHaveLength(1);
    expect(fake.commands[0]).toBeInstanceOf(PutObjectCommand);
    expect(fake.commands[0]?.input).toMatchObject({
      Bucket: "catalog",
      Key: stored.objectKey,
      ContentType: "image/png",
      Body: new Uint8Array([1, 2, 3]),
    });
  });

  it("elimina el object key indicado en S3", async () => {
    const fake = createFakeClient();
    const storage = new S3ObjectStorage(config, fake.client);

    await storage.delete("catalog/producto.webp");

    expect(fake.commands[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(fake.commands[0]?.input).toEqual({
      Bucket: "catalog",
      Key: "catalog/producto.webp",
    });
  });

  it("mantiene las validaciones de formato y tamaño del adaptador local", async () => {
    const storage = new S3ObjectStorage(config, createFakeClient().client);

    await expect(storage.store({ bytes: new Uint8Array(), fileName: "vacía.png", contentType: "image/png" }))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(storage.store({ bytes: new Uint8Array([1]), fileName: "texto.txt", contentType: "text/plain" }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("usa almacenamiento local si no se configura un driver", () => {
    const storage = createObjectStorage({});

    expect(storage).toBeInstanceOf(LocalObjectStorage);
  });

  it("usa almacenamiento local en producción si el driver es local", () => {
    const productionEnv = {
      NODE_ENV: "production",
      OBJECT_STORAGE_DRIVER: "local",
    } as const;
    const storage = createObjectStorage(productionEnv);

    expect(storage).toBeInstanceOf(LocalObjectStorage);
  });

  it("usa public/uploads como raíz predeterminada y conserva la URL pública", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "lauril-storage-default-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workingDirectory);
    try {
      const storage = createObjectStorage({});
      const stored = await storage.store({
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "producto.png",
        contentType: "image/png",
      });

      expect(stored.objectKey).toMatch(/^local\/catalog\/[0-9a-f-]+\.png$/);
      expect(stored.url).toBe(`/uploads/catalog/${path.basename(stored.objectKey)}`);
      await expect(readFile(path.join(workingDirectory, "public", "uploads", "catalog", path.basename(stored.objectKey))))
        .resolves.toEqual(Buffer.from([1, 2, 3]));
    } finally {
      cwd.mockRestore();
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it("escribe y elimina en LOCAL_UPLOAD_ROOT sin cambiar objectKey ni URL", async () => {
    const uploadRoot = await mkdtemp(path.join(tmpdir(), "lauril-storage-custom-"));
    try {
      const storage = createObjectStorage({
        OBJECT_STORAGE_DRIVER: "local",
        LOCAL_UPLOAD_ROOT: uploadRoot,
      });
      const stored = await storage.store({
        bytes: new Uint8Array([4, 5, 6]),
        fileName: "producto.webp",
        contentType: "image/webp",
      });
      const storedPath = path.join(uploadRoot, "catalog", path.basename(stored.objectKey));

      expect(stored.objectKey).toMatch(/^local\/catalog\/[0-9a-f-]+\.webp$/);
      expect(stored.url).toBe(`/uploads/catalog/${path.basename(stored.objectKey)}`);
      await expect(readFile(storedPath)).resolves.toEqual(Buffer.from([4, 5, 6]));

      await storage.delete(stored.objectKey);

      await expect(readFile(storedPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(uploadRoot, { recursive: true, force: true });
    }
  });

  it("falla claramente si falta configuración para el driver S3", () => {
    expect(() => createObjectStorage({ OBJECT_STORAGE_DRIVER: "s3" })).toThrow(
      "Configuración S3 incompleta: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL",
    );
  });

  it("crea el adaptador S3 con la configuración completa", () => {
    const storage = createObjectStorage({
      OBJECT_STORAGE_DRIVER: "s3",
      S3_ENDPOINT: config.endpoint,
      S3_REGION: config.region,
      S3_BUCKET: config.bucket,
      S3_ACCESS_KEY_ID: config.accessKeyId,
      S3_SECRET_ACCESS_KEY: config.secretAccessKey,
      S3_PUBLIC_BASE_URL: config.publicBaseUrl,
    });

    expect(storage).toBeInstanceOf(S3ObjectStorage);
  });

  it("falla claramente si el driver es inválido", () => {
    expect(() => createObjectStorage({ OBJECT_STORAGE_DRIVER: "filesystem" })).toThrow(
      "OBJECT_STORAGE_DRIVER inválido: filesystem. Valores soportados: local, s3",
    );
  });
});
