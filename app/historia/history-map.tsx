import { PANAMA_RINGS } from "../../lib/panama";
import { formatMag, placeEs, type HistoricQuake } from "../../lib/history";

// Mapa fijo (SVG, sin código en el navegador) de los sismos grandes desde 1900: cada círculo es un sismo del catálogo del
// USGS, su tamaño es la magnitud y su color la época. Se dibuja en el servidor con los mismos datos de la tabla.
const MIN_LNG = -83.8;
const MAX_LNG = -77;
const MIN_LAT = 6;
const MAX_LAT = 10.7;
const W = 760;
const H = Math.round((W * (MAX_LAT - MIN_LAT)) / (MAX_LNG - MIN_LNG));

const x = (lng: number) => ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * W;
const y = (lat: number) => ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * H;
const radius = (mag: number) => 3 + (mag - 5.9) * 5;

export function eraOf(quake: HistoricQuake) {
  if (quake.current) return "now";
  const year = new Date(quake.time).getUTCFullYear();
  return year < 1950 ? "e1" : year < 2000 ? "e2" : "e3";
}

export default function HistoryMap({ quakes }: { quakes: HistoricQuake[] }) {
  const outline = PANAMA_RINGS.map(ring => `M${ring.map(([lng, lat]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("L")}Z`).join("");
  const ordered = [...quakes].sort((a, b) => b.mag - a.mag); // los grandes debajo, los chicos encima
  const labeled = quakes.filter(q => q.mag >= 7);
  const lngTicks = [-83, -82, -81, -80, -79, -78];
  const latTicks = [7, 8, 9, 10];
  return (
    <svg className="hs-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="hs-map-title hs-map-desc">
      <title id="hs-map-title">Mapa de los sismos de magnitud 6 o más en Panamá desde 1900</title>
      <desc id="hs-map-desc">
        Cada círculo es un sismo del catálogo del USGS; mientras más grande el círculo, mayor la magnitud. Los sismos grandes se concentran
        al suroeste del país. El de octubre de 2026 aparece en rojo, en la península de Azuero. La tabla de abajo lista los más grandes.
      </desc>
      <rect className="hs-sea" width={W} height={H} rx="14" />
      <g className="hs-grid" aria-hidden="true">
        {lngTicks.map(l => (
          <g key={l}>
            <line x1={x(l)} x2={x(l)} y1="0" y2={H} />
            <text x={x(l) + 4} y={H - 8}>{Math.abs(l)}° O</text>
          </g>
        ))}
        {latTicks.map(l => (
          <g key={l}>
            <line x1="0" x2={W} y1={y(l)} y2={y(l)} />
            <text x="8" y={y(l) - 5}>{l}° N</text>
          </g>
        ))}
      </g>
      <path className="hs-land" d={outline} />
      <g>
        {ordered.map(quake => {
          const era = eraOf(quake);
          const r = radius(quake.mag);
          return (
            <g key={quake.id}>
              {era === "now" && quake.mag >= 7 && <circle className="hs-halo" cx={x(quake.lng)} cy={y(quake.lat)} r={r + 7} />}
              <circle className={`hs-dot hs-${era}`} cx={x(quake.lng)} cy={y(quake.lat)} r={r}>
                <title>{`M ${formatMag(quake.mag)} · ${new Date(quake.time).getUTCFullYear()} · ${placeEs(quake.place)}`}</title>
              </circle>
            </g>
          );
        })}
      </g>
      <g className="hs-labels" aria-hidden="true">
        {labeled.map(quake => (
          <text key={quake.id} className={quake.current ? "hs-label-now" : undefined} x={x(quake.lng)} y={y(quake.lat) - radius(quake.mag) - (quake.current ? 12 : 5)} textAnchor="middle">
            {quake.current ? `${new Date(quake.time).getUTCFullYear()} · M ${formatMag(quake.mag)}` : new Date(quake.time).getUTCFullYear()}
          </text>
        ))}
      </g>
    </svg>
  );
}
