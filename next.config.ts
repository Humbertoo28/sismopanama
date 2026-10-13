import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";

// Política de contenido: solo se permite lo que esta página realmente usa.
// - script-src admite 'unsafe-inline' porque Next.js incrusta los datos de hidratación en la propia
//   página. Quitarlo exige generar un nonce por visita, lo que impide servir la página desde la
//   caché del CDN; para una página de emergencia con picos de tráfico se priorizó la disponibilidad.
//   El resto de directivas limita lo que un script inyectado podría hacer: no puede cargar código
//   externo, enviar datos a otros sitios ni mostrarse dentro de un marco.
// - style-src-attr admite estilos en línea porque los marcadores del mapa y React los usan.
// - img-src incluye los mosaicos de los mapas (Google, Esri, Carto, OpenStreetMap) y los de elevación de AWS (Terrain Tiles,
//   s3.amazonaws.com/elevation-tiles-prod) con los que la vista 3D levanta el relieve.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.google.com https://*.googleapis.com https://*.arcgisonline.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://s3.amazonaws.com",
  "font-src 'self'",
  "connect-src 'self' https://*.google.com https://*.googleapis.com https://*.arcgisonline.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.cartocdn.com https://va.vercel-scripts.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  ...(production ? [{ key: "Content-Security-Policy", value: csp }] : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // OpenStreetMap exige un Referer válido para servir sus mosaicos: no se puede usar no-referrer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=(), serial=(), hid=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // El sitio no usa next/image: se desactiva el optimizador para no exponer ese endpoint.
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/siren.wav",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Leaflet va incluido en el proyecto y no cambia: una semana de caché (y hasta un mes mientras se renueva).
        source: "/leaflet.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
      },
      {
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: ".*\\.vercel\\.app",
          },
        ],
        destination: "https://www.ojopanama.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
