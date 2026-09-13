import type { EmailSender, PasswordResetDelivery } from "../application/email-sender";

type ResendEmailSenderConfig = Readonly<{
  apiKey: string;
  from: string;
  appUrl: string;
}>;

type HttpClient = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly config: ResendEmailSenderConfig,
    private readonly httpClient: HttpClient = fetch,
  ) {}

  async sendPasswordReset(
    input: Parameters<EmailSender["sendPasswordReset"]>[0],
  ): Promise<PasswordResetDelivery> {
    const resetUrl = new URL("/restablecer-clave", this.config.appUrl);
    resetUrl.hash = `token=${input.token}`;

    const response = await this.httpClient("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [input.recipientEmail],
        subject: "Restablecé tu clave de Lauril",
        text: passwordResetText(input.recipientName, resetUrl, input.expiresAt),
        html: passwordResetHtml(input.recipientName, resetUrl, input.expiresAt),
      }),
    });

    if (!response.ok) {
      throw new Error(`No se pudo enviar el email de recuperación (Resend HTTP ${response.status}).`);
    }

    return { developmentPreviewUrl: null };
  }

  async sendContactMessage(input: Parameters<EmailSender["sendContactMessage"]>[0]): Promise<void> {
    const response = await this.httpClient("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: ["lauril.quimica66@gmail.com"],
        reply_to: input.email,
        subject: `Consulta web de ${input.name}`,
        text: contactMessageText(input),
        html: contactMessageHtml(input),
      }),
    });

    if (!response.ok) {
      throw new Error(`No se pudo enviar el mensaje de contacto (Resend HTTP ${response.status}).`);
    }
  }
}

function contactMessageText(input: Parameters<EmailSender["sendContactMessage"]>[0]): string {
  return [`Nombre: ${input.name}`, `Email: ${input.email}`, `Teléfono: ${input.phone ?? "No informado"}`, "", input.message].join("\n");
}

function contactMessageHtml(input: Parameters<EmailSender["sendContactMessage"]>[0]): string {
  return `<p><strong>Nombre:</strong> ${escapeHtml(input.name)}</p><p><strong>Email:</strong> ${escapeHtml(input.email)}</p><p><strong>Teléfono:</strong> ${escapeHtml(input.phone ?? "No informado")}</p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`;
}

function passwordResetText(name: string, resetUrl: URL, expiresAt: Date): string {
  return [
    `Hola ${name},`,
    "",
    "Recibimos una solicitud para restablecer tu clave de Lauril.",
    `Abrí este enlace: ${resetUrl.toString()}`,
    `El enlace vence el ${expiresAt.toISOString()}.`,
    "",
    "Si no hiciste esta solicitud, podés ignorar este mensaje.",
  ].join("\n");
}

function passwordResetHtml(name: string, resetUrl: URL, expiresAt: Date): string {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl.toString());
  const safeExpiration = escapeHtml(expiresAt.toISOString());
  return `<p>Hola ${safeName},</p><p>Recibimos una solicitud para restablecer tu clave de Lauril.</p><p><a href="${safeUrl}">Restablecer mi clave</a></p><p>El enlace vence el ${safeExpiration}.</p><p>Si no hiciste esta solicitud, podés ignorar este mensaje.</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character]!;
  });
}
