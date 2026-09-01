export type ObjectUpload = Readonly<{
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}>;

export type StoredObject = Readonly<{
  objectKey: string;
  url: string;
}>;

export interface ObjectStorage {
  store(upload: ObjectUpload): Promise<StoredObject>;
  delete(objectKey: string): Promise<void>;
}
