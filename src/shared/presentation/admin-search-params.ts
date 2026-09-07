export type AdminSearchParams = Record<string, string | string[] | undefined>;

export function textParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export function pageParam(value: string | string[] | undefined): number {
  const parsed = Number(textParam(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function adminPageHref(path: string, parameters: AdminSearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === "string" && key !== "page" && value) query.set(key, value);
  }
  query.set("page", String(Math.max(1, page)));
  return `${path}?${query}`;
}
