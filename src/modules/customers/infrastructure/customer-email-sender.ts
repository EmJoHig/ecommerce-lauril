import type { EmailSender, PasswordResetDelivery } from "../application/email-sender";

export class CustomerEmailSender implements EmailSender {
  constructor(
    private readonly appUrl: string,
    private readonly exposeDevelopmentPreview: boolean,
  ) {}

  async sendPasswordReset(input: Parameters<EmailSender["sendPasswordReset"]>[0]): Promise<PasswordResetDelivery> {
    const url = new URL("/restablecer-clave", this.appUrl);
    url.hash = `token=${input.token}`;
    return Promise.resolve({
      developmentPreviewUrl: this.exposeDevelopmentPreview ? url.toString() : null,
    });
  }
}
