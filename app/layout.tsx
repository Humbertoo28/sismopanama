import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import Accessibility, { SkipLink } from "./accessibility";
import SampledAnalytics from "./sampled-analytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, pageSocial } from "../lib/site";
import { SiteStructuredData } from "./structured-data";
import "./leaflet.css";
import "./fonts.css";
import "./globals.css";
import "./responsive.css";
import "./usgs-layers.css";
import "./accessibility.css";
import "./theme.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Las demás páginas ponen solo su nombre y el sitio completa con "| Ojo Panamá".
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Ojo Panamá", url: "https://www.ojopanama.com" }],
  creator: "Ojo Panamá",
  publisher: "Ojo Panamá",
  manifest: "/manifest.json?v=2",
  icons: {
    icon: "/favicon.svg?v=2",
    apple: "/apple-touch-icon.png?v=2",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // La app instalada usa la barra de estado translúcida: el contenido llega hasta el borde y el CSS
  // deja espacio con env(safe-area-inset-*) para el notch, la barra de estado y el indicador de inicio.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Las dos fuentes se precargan con react-dom (una sola etiqueta cada una): como <link> en el <head>, React las dejaba dos veces.
  preload("/fonts/dm-sans-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/fonts/space-grotesk-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="es-PA" suppressHydrationWarning>
      <head>
        {/* El manifiesto, el ícono, el título y la barra de estado de la app salen de `metadata` y `viewport`; aquí solo va lo que Next
            no emite: la marca antigua de Safari para instalar la web como app. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <SiteStructuredData />
        {/* Aplica el tema (claro u oscuro, ver lib/theme.ts) y las opciones de accesibilidad guardadas antes de pintar la página
            (ver accessibility.tsx). Texto fijo. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var c=localStorage.getItem("sismo_panama_theme_v1");c=c==="auto"||c==="dark"?c:"light";var t=c==="auto"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):c;document.documentElement.dataset.theme=t;document.documentElement.dataset.themeChoice=c;document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",t==="dark"?"#0b1220":"#ffffff")})}catch(e){}try{var s=JSON.parse(localStorage.getItem("sismo_panama_a11y_v1")||"null");if(s){var r=document.documentElement;if(s.scale)r.style.setProperty("--ts",String(s.scale));if(s.scale>1)r.dataset.a11yScale="large";if(s.contrast)r.dataset.a11yContrast="high";if(s.motion)r.dataset.a11yMotion="reduce";if(s.links)r.dataset.a11yLinks="underline";if(s.spacing)r.dataset.a11ySpacing="wide"}}catch(e){}`,
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
