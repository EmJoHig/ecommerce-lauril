import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStorage, ObjectUpload, StoredObject } from "../application/object-storage";
import { validateCatalogImageUpload } from "./catalog-image-upload";

export type S3ObjectStorageConfig = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}>;

type S3Command = PutObjectCommand | DeleteObjectCommand;
type S3ClientLike = Readonly<{
  send(command: S3Command): Promise<unknown>;
}>;

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3ClientLike;

  constructor(
    private readonly config: S3ObjectStorageConfig,
    client?: S3ClientLike,
  ) {
    this.client = client ?? new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async store(upload: ObjectUpload): Promise<StoredObject> {
    const extension = validateCatalogImageUpload(upload);
    const objectKey = `catalog/${randomUUID()}.${extension}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      Body: upload.bytes,
      ContentType: upload.contentType,
    }));
    return {
      objectKey,
      url: `${this.config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`,
    };
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
    }));
  }
}
