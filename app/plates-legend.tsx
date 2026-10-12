import { KIND_INFO, PLATES_SOURCE, type BoundaryKind } from "../lib/plates";

// Muestra del trazo de cada tipo de límite tal como se dibuja en el mapa: la subducción y la convergencia llevan triángulos.
function KindSymbol({ kind, teeth: withTeeth }: { kind: BoundaryKind; teeth: boolean }) {
  const color = KIND_INFO[kind].color;
  const teeth = withTeeth && (kind === "subduction" || kind === "convergent");
  return (
    <svg className="plate-symbol" viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
      <path d="M1 8h28" stroke="#0b1a33" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
      <path d="M1 8h28" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      {teeth && [7, 17].map(x => <path key={x} d={`M${x - 3.5} 7.5L${x + 3.5} 7.5L${x} 1.5Z`} fill={color} stroke="#0b1a33" strokeOpacity=".6" strokeWidth=".7" />)}
    </svg>
  );
}

// Leyenda de los límites de placas: el trazo de cada tipo de límite. `detailed` (el mapa plano) agrega qué significa cada
// uno y los triángulos, que el 3D no dibuja.
export default function PlatesLegend({ detailed = false }: { detailed?: boolean }) {
  const kinds = Object.keys(KIND_INFO) as BoundaryKind[];
  return (
    <>
      <span className={`plate-keys${detailed ? " detailed" : ""}`}>
        {kinds.map(kind => (
          <span key={kind} className="plate-key" title={`${KIND_INFO[kind].name}: ${KIND_INFO[kind].meaning}`}>
            <KindSymbol kind={kind} teeth={detailed} />
            {KIND_INFO[kind].name}{detailed && <> ({KIND_INFO[kind].meaning})</>}
          </span>
        ))}
      </span>
      <span className="plate-note">{PLATES_SOURCE}. Límites aproximados.</span>
    </>
  );
}
