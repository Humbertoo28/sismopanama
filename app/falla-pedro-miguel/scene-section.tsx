"use client";

import { useState } from "react";
import { depthIsAssigned, type SceneQuake } from "../../lib/fault-geometry";
import FaultScene from "./fault-scene";

// La escena 3D de la falla más una tabla con los mismos sismos (la escena no la leen bien las ayudas de lectura de pantalla).
type Props = { lines: [number, number][][]; quakes: SceneQuake[]; labels: { name: string; lat: number; lng: number }[] };

const dateTime = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const SOURCE_NAMES = { usgs: "USGS", igc: "IGC", emsc: "EMSC" } as const;

export default function SceneSection({ lines, quakes, labels }: Props) {
  // Empieza sin tarjeta abierta: tapaba la parte baja de la falla; se abre al tocar un círculo.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sorted = [...quakes].sort((a, b) => b.time - a.time);
  return (
    <>
      <FaultScene lines={lines} quakes={quakes} labels={labels} selectedId={selectedId} onSelect={setSelectedId} />
      <details className="fp-table">
        <summary>Ver los {quakes.length} sismos en una tabla</summary>
        <div className="fp-table-wrap">
          <table>
            <caption>Sismos registrados dentro del recuadro de la escena, del más reciente al más antiguo.</caption>
            <thead>
              <tr><th scope="col">Fecha (hora de Panamá)</th><th scope="col">Magnitud</th><th scope="col">Profundidad</th><th scope="col">Distancia a la traza (cálculo propio)</th><th scope="col">Lugar</th><th scope="col">Fuente</th></tr>
            </thead>
            <tbody>
              {sorted.map(quake => (
                <tr key={quake.id} className={quake.highlight ? "hl" : undefined}>
                  <td>{dateTime.format(quake.time)}</td>
                  <td>{quake.mag === null ? "—" : quake.mag.toFixed(1)}</td>
                  <td>{quake.depthKm === null ? "sin dato" : `${quake.depthKm.toLocaleString("es-PA", { maximumFractionDigits: 1 })} km${depthIsAssigned(quake.depthKm) ? " (asignada)" : ""}`}</td>
                  <td>{quake.traceKm === undefined ? "—" : `${quake.traceKm.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km al ${quake.traceSide}`}</td>
                  <td>{quake.place}</td>
                  <td>{SOURCE_NAMES[quake.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
