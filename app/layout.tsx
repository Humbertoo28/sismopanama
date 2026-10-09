import type { Metadata } from "next";
import "./leaflet.css";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sismo Panamá — Monitor sísmico",
  description:
    "Consulta sismos recientes en Panamá, con mapa, magnitud y hora local. Datos del USGS, contrastados con EMSC y GFZ.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
