import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("cabeceras HTTP de Next.js", () => {
  it("aplica los headers de seguridad a todas las rutas de la aplicación", async () => {
    const routes = await nextConfig.headers!();
    expect(routes).toHaveLength(1);
    const route = routes[0]!;
    expect(route.source).toBe("/:path*");
    expect(Object.fromEntries(route.headers.map(({ key, value }) => [key, value]))).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });

  it("mantiene la CSP solo en Report-Only con los recursos actuales", async () => {
    const [route] = await nextConfig.headers!();
    expect(route).toBeDefined();
    const headers = Object.fromEntries(route!.headers.map(({ key, value }) => [key, value]));

    expect(headers["Content-Security-Policy-Report-Only"]).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
        "form-action 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; " +
        "script-src 'self'; style-src 'self'",
    );
    expect(headers).not.toHaveProperty("Content-Security-Policy");
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
    expect(headers).not.toHaveProperty("Cross-Origin-Opener-Policy");
    expect(headers).not.toHaveProperty("Cross-Origin-Embedder-Policy");
    expect(headers).not.toHaveProperty("Cross-Origin-Resource-Policy");
  });
});
