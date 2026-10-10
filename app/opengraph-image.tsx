import { ImageResponse } from "next/og";
import { SITE_URL } from "../lib/site";

// Imagen que se ve al compartir el enlace en WhatsApp, LinkedIn, X, Telegram... Es fija y no promete nada en vivo:
// solo dice qué es el sitio y de dónde salen los datos.
export const alt = "Sismo Panamá: sismos y réplicas en vivo, mapa y avisos al celular";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#072357";
const RED = "#da121a";
const BLUE = "#0a3a8c";

function Star({ color }: { color: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24">
      <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.2L12 17.8 5.7 21.4l1.7-7.2L2 9.5l7.1-.6z" fill={color} />
    </svg>
  );
}

function Flag() {
  const cell = { display: "flex", width: 90, height: 60, alignItems: "center", justifyContent: "center" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 180, height: 120, borderRadius: 14, overflow: "hidden", border: "3px solid #ffffffd9" }}>
      <div style={{ display: "flex" }}>
        <div style={{ ...cell, background: "#fff" }}><Star color={BLUE} /></div>
        <div style={{ ...cell, background: RED }} />
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ ...cell, background: BLUE }} />
        <div style={{ ...cell, background: "#fff" }}><Star color={RED} /></div>
      </div>
    </div>
  );
}

export default function Image() {
  const chip = { display: "flex", padding: "10px 26px", borderRadius: 999, border: "2px solid #ffffff59", fontSize: 30, color: "#dbe6f7" } as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: `linear-gradient(135deg, ${NAVY} 0%, #0b2f6b 100%)`, color: "#fff", padding: "64px 76px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Flag />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 76, letterSpacing: 8 }}>SISMO</div>
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 18, color: "#b3c2d2", marginTop: 4 }}>PANAMÁ</div>
          </div>
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
