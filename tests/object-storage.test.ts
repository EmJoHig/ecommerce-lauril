import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

  it("usa almacenamiento local fuera de producción", () => {
    const storage = createObjectStorage({ NODE_ENV: "development" });

    expect(storage).toBeInstanceOf(LocalObjectStorage);
  });

  it("falla claramente si falta configuración S3 en producción", () => {
    expect(() => createObjectStorage({ NODE_ENV: "production" })).toThrow(
      "Configuración S3 incompleta: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL",
    );
  });

  it("crea el adaptador S3 con la configuración productiva completa", () => {
    const storage = createObjectStorage({
      NODE_ENV: "production",
      S3_ENDPOINT: config.endpoint,
      S3_REGION: config.region,
      S3_BUCKET: config.bucket,
      S3_ACCESS_KEY_ID: config.accessKeyId,
      S3_SECRET_ACCESS_KEY: config.secretAccessKey,
      S3_PUBLIC_BASE_URL: config.publicBaseUrl,
    });

    expect(storage).toBeInstanceOf(S3ObjectStorage);
  });
});
