import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";

// Política de contenido: solo se permite lo que esta página realmente usa.
// - script-src admite 'unsafe-inline' porque Next.js incrusta los datos de hidratación en la propia
//   página. Quitarlo exige generar un nonce por visita, lo que impide servir la página desde la
//   caché del CDN; para una página de emergencia con picos de tráfico se priorizó la disponibilidad.
//   El resto de directivas limita lo que un script inyectado podría hacer: no puede cargar código
//   externo, enviar datos a otros sitios ni mostrarse dentro de un marco.
// - style-src-attr admite estilos en línea porque los marcadores del mapa y React los usan.
// - img-src incluye los mosaicos de OpenStreetMap, que es lo único de terceros que se carga.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'none'",
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
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // El sitio no usa next/image: se desactiva el optimizador para no exponer ese endpoint.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
