import type { Metadata } from "next";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicStoreSettings();
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: settings.storeName, template: `%s · ${settings.storeName}` },
    description: settings.publicDescription ?? undefined,
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="es">
      <body>{children}</body>
    </html>
  );
}
