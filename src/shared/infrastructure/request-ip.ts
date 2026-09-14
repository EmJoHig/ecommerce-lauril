import "server-only";

import { isIP } from "node:net";

/**
 * Resolves the browser IP when exactly one trusted Nginx proxy sits in front of
 * Next.js. Nginx appends its direct peer as the rightmost X-Forwarded-For hop,
 * so client-controlled values prepended on the left are deliberately ignored.
 */
export function resolveRequestIp(requestHeaders: Pick<Headers, "get">): string | null {
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (!forwardedFor) return null;

  const nearestHop = forwardedFor
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean)
    .at(-1);

  return nearestHop && isIP(nearestHop) ? nearestHop : null;
}
