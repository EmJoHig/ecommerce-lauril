export function isLocalUploadUrl(url: string | null | undefined): boolean {
  return url?.startsWith("/uploads/") ?? false;
}
