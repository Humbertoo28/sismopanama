import { KIND_INFO, PLATES_SOURCE, type BoundaryKind } from "../lib/plates";

// Leyenda de los límites de placas: un color por tipo de límite. `detailed` agrega qué significa cada uno.
export default function PlatesLegend({ detailed = false }: { detailed?: boolean }) {
  const kinds = Object.keys(KIND_INFO) as BoundaryKind[];
  return (
    <>
      <span className={`plate-keys${detailed ? " detailed" : ""}`}>
        {kinds.map(kind => (
          <span key={kind} className="plate-key" title={`${KIND_INFO[kind].name}: ${KIND_INFO[kind].meaning}`}>
            <i aria-hidden="true" style={{ background: KIND_INFO[kind].color }} />
            {KIND_INFO[kind].name}{detailed && <> ({KIND_INFO[kind].meaning})</>}
          </span>
        ))}
      </span>
      <span className="plate-note">{PLATES_SOURCE}. Límites aproximados.</span>
    </>
  );
}
