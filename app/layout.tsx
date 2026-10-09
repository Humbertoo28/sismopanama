import type { Metadata } from "next";
import "./leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sismo Panamá — Monitor sísmico",
  description:
    "Consulta sismos recientes en Panamá y sus alrededores, con mapa, magnitud y hora local. Datos del USGS, contrastados con EMSC y GFZ.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
