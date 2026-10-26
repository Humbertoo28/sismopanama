import { ImageResponse } from "next/og";
import faviconSvg from "../public/favicon.svg?raw";
import { SITE_URL } from "../lib/site";

// Imagen que se ve al compartir el enlace en WhatsApp, LinkedIn, X, Telegram... Es fija y no promete nada en vivo:
// solo dice qué es el sitio y de dónde salen los datos.
export const alt = "Ojo Panamá: sismos y réplicas en vivo, mapa y avisos al celular";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#072357";
const RED = "#da121a";

// El logo (ojo con ondas que salen de un epicentro rojo), el mismo archivo que el ícono de la pestaña.
const LOGO = `data:image/svg+xml;base64,${btoa(faviconSvg)}`;

export default function Image() {
  const chip = { display: "flex", padding: "10px 26px", borderRadius: 999, border: "2px solid #ffffff59", fontSize: 30, color: "#dbe6f7" } as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: `linear-gradient(135deg, ${NAVY} 0%, #0b2f6b 100%)`, color: "#fff", padding: "64px 76px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <img src={LOGO} width={150} height={150} alt="" style={{ borderRadius: 34, border: "3px solid #ffffff40" }} />
          <div style={{ display: "flex", fontSize: 78, fontWeight: 700, letterSpacing: -1 }}>Ojo Panamá</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 120, height: 8, background: RED, borderRadius: 4, marginBottom: 28 }} />
          <div style={{ display: "flex", fontSize: 86, lineHeight: 1.05 }}>Sismos y réplicas en vivo</div>
          <div style={{ display: "flex", fontSize: 38, color: "#b3c2d2", marginTop: 20 }}>Mapa, gráficos y avisos al celular</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={chip}>USGS</div>
            <div style={chip}>IGC</div>
            <div style={chip}>EMSC</div>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#b3c2d2" }}>{SITE_URL.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
