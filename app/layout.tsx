import type { Metadata, Viewport } from "next";
import Accessibility, { SkipLink } from "./accessibility";
import SampledAnalytics from "./sampled-analytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, pageSocial } from "../lib/site";
import { SiteStructuredData } from "./structured-data";
import "./leaflet.css";
import "./fonts.css";
import "./globals.css";
import "./responsive.css";
import "./accessibility.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Las demás páginas ponen solo su nombre y el sitio completa con "| Sismo Panamá".
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  ...pageSocial(SITE_TITLE, SITE_DESCRIPTION, "/"),
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
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
    <html lang="es-PA" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Sismo Panamá" />
        <meta name="theme-color" content="#072357" />
        <link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <SiteStructuredData />
        {/* Aplica las opciones de accesibilidad guardadas antes de pintar la página (ver accessibility.tsx). Texto fijo. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("sismo_panama_a11y_v1")||"null");if(s){var r=document.documentElement;if(s.scale)r.style.setProperty("--ts",String(s.scale));if(s.contrast)r.dataset.a11yContrast="high";if(s.motion)r.dataset.a11yMotion="reduce";if(s.links)r.dataset.a11yLinks="underline";if(s.spacing)r.dataset.a11ySpacing="wide"}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SkipLink />
        {children}
        <Accessibility />
        {/* Estadísticas de visitas de Vercel: sin cookies y sin enlaces. Solo se ven en el panel privado de Vercel.
            Es una muestra del 10 % de las visitas (cada evento se cobra); ver sampled-analytics.tsx. */}
        <SampledAnalytics />
      </body>
    </html>
  );
}
