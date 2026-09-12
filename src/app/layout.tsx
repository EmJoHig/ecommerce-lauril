import type { Metadata } from "next";
import { Poppins, Rubik } from "next/font/google";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";
import "./globals.css";

const poppins = Poppins({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"],
});

const rubik = Rubik({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-rubik",
});

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
    <html className={`${poppins.variable} ${rubik.variable}`} data-scroll-behavior="smooth" lang="es">
      <body>{children}</body>
    </html>
  );
}
