import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Lauril", template: "%s · Lauril" },
  description: "Objetos elegidos para acompañar tus rituales cotidianos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="es">
      <body>{children}</body>
    </html>
  );
}
