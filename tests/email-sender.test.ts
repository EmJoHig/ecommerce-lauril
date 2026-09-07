import { describe, expect, it, vi } from "vitest";
import { CustomerEmailSender } from "@/modules/customers/infrastructure/customer-email-sender";
import { createEmailSender } from "@/modules/customers/infrastructure/email-sender-composition";
import { ResendEmailSender } from "@/modules/customers/infrastructure/resend-email-sender";

vi.mock("server-only", () => ({}));

const input = {
  recipientEmail: "cliente@example.com",
  recipientName: "Cliente <Lauril>",
  token: "token-seguro",
  expiresAt: new Date("2026-09-07T18:00:00.000Z"),
};

describe("EmailSender", () => {
  it("conserva el preview local en development", async () => {
    const sender = createEmailSender({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
    });

    expect(sender).toBeInstanceOf(CustomerEmailSender);
    await expect(sender.sendPasswordReset(input)).resolves.toEqual({
      developmentPreviewUrl: "http://localhost:3000/restablecer-clave#token=token-seguro",
    });
  });

  it("usa el sender local sin exponer preview en test", async () => {
    const sender = createEmailSender({
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
    });

    expect(sender).toBeInstanceOf(CustomerEmailSender);
    await expect(sender.sendPasswordReset(input)).resolves.toEqual({
      developmentPreviewUrl: null,
    });
  });

  it("valida la configuración y selecciona Resend en production", () => {
    expect(() => createEmailSender({
      NODE_ENV: "production",
      APP_URL: "https://lauril.example.com",
    })).toThrow("Configuración de email incompleta: RESEND_API_KEY, EMAIL_FROM");

    expect(createEmailSender({
      NODE_ENV: "production",
      APP_URL: "https://lauril.example.com",
      RESEND_API_KEY: "resend-test-key",
      EMAIL_FROM: "Lauril <no-reply@example.com>",
    })).toBeInstanceOf(ResendEmailSender);
  });

  it("envía la recuperación con Resend sin exponer preview ni credenciales", async () => {
    const httpClient = vi.fn<(
      input: string | URL | Request,
      request?: RequestInit,
    ) => Promise<Response>>().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );
    const sender = new ResendEmailSender({
      apiKey: "resend-test-key",
      from: "Lauril <no-reply@example.com>",
      appUrl: "https://lauril.example.com",
    }, httpClient);

    await expect(sender.sendPasswordReset(input)).resolves.toEqual({
      developmentPreviewUrl: null,
    });
    expect(httpClient).toHaveBeenCalledOnce();

    const [url, request] = httpClient.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(request?.headers).toEqual({
      Authorization: "Bearer resend-test-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(request?.body as string)).toMatchObject({
      from: "Lauril <no-reply@example.com>",
      to: ["cliente@example.com"],
      subject: "Restablecé tu clave de Lauril",
    });
    expect(request?.body).toContain("https://lauril.example.com/restablecer-clave#token=token-seguro");
    expect(request?.body).toContain("Cliente &lt;Lauril&gt;");
  });

  it("reporta un rechazo del proveedor sin incluir su respuesta ni la clave", async () => {
    const sender = new ResendEmailSender({
      apiKey: "secret-key",
      from: "Lauril <no-reply@example.com>",
      appUrl: "https://lauril.example.com",
    }, async () => new Response("provider-sensitive-response", { status: 422 }));

    await expect(sender.sendPasswordReset(input)).rejects.toThrow(
      "No se pudo enviar el email de recuperación (Resend HTTP 422).",
    );
  });
});
