export type PasswordResetDelivery = Readonly<{
  developmentPreviewUrl: string | null;
}>;

export interface EmailSender {
  sendPasswordReset(input: {
    recipientEmail: string;
    recipientName: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetDelivery>;
  sendContactMessage(input: {
    name: string;
    email: string;
    phone: string | null;
    message: string;
  }): Promise<void>;
}
