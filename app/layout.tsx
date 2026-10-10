import type { Metadata, Viewport } from "next";
import "./leaflet.css";
import "./fonts.css";
import "./globals.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: "Sismo Panamá — Monitor y Alerta Sísmica",
  description:
    "Consulta sismos recientes en Panamá con mapa, magnitud, hora local y alertas sonoras en vivo.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sismo Panamá",
  },
};

export const viewport: Viewport = {
  themeColor: "#072357",
  width: "device-width",
  initialScale: 1,
  // La app instalada usa la barra de estado translúcida: el contenido llega hasta el borde y el CSS
  // deja espacio con env(safe-area-inset-*) para el notch, la barra de estado y el indicador de inicio.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Sismo Panamá" />
        <meta name="theme-color" content="#072357" />
        <link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
