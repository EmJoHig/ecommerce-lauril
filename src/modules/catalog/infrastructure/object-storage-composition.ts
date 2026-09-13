import type { ServerEnv } from "@/shared/infrastructure/env";
import type { ObjectStorage } from "../application/object-storage";
import { LocalObjectStorage } from "./local-object-storage";
import { S3ObjectStorage } from "./s3-object-storage";

type ObjectStorageEnv = Partial<Pick<
  ServerEnv,
  | "S3_ENDPOINT"
  | "S3_REGION"
  | "S3_BUCKET"
  | "S3_ACCESS_KEY_ID"
  | "S3_SECRET_ACCESS_KEY"
  | "S3_PUBLIC_BASE_URL"
>> & { OBJECT_STORAGE_DRIVER?: string };

const requiredS3Variables = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_BASE_URL",
] as const;

export function createObjectStorage(env: ObjectStorageEnv): ObjectStorage {
  const driver = env.OBJECT_STORAGE_DRIVER ?? "local";
  if (driver === "local") return new LocalObjectStorage();
  if (driver !== "s3") {
    throw new Error(
      `OBJECT_STORAGE_DRIVER inválido: ${driver}. Valores soportados: local, s3`,
    );
  }

  const missing = requiredS3Variables.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Configuración S3 incompleta: ${missing.join(", ")}`);
  }

  return new S3ObjectStorage({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION!,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL!,
  });
}
