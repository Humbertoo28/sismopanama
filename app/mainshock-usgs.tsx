"use client";

import { useEffect, useRef } from "react";
import { describeMechanism, drawBeachball } from "../lib/beachball";
import type { Mechanism } from "../lib/usgs-detail";
import { loadMainshockDetail, useMainshockDetail } from "./mainshock-detail";

const deg = (value: number) => `${Math.round(value)}°`.replace("-", "−");

function Beachball({ mechanism }: { mechanism: Mechanism }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawBeachball(canvas.current, mechanism.tensor, 132);
  }, [mechanism]);
  return <canvas ref={canvas} className="usgs-ball" role="img" aria-label={`Mecanismo focal del sismo principal: ${describeMechanism(mechanism.planes)}`} />;
}

// Lo que el USGS publica del sismo principal además de su ubicación: cómo se movió la falla, cuánto se rompió y qué
// reportó la gente. Todo se muestra tal cual lo publica; esta página no calcula nada. Se pide al abrir la ficha.
export default function MainshockUsgs() {
  const { status, detail } = useMainshockDetail();
  const { mechanism, fault, felt } = detail ?? { mechanism: null, fault: null, felt: null };

  return (
    <details className="usgs-card" onToggle={event => event.currentTarget.open && loadMainshockDetail()}>
      <summary>
        <span className="section-kicker">Fuente: USGS</span>
        <strong>Datos del sismo principal: cómo se movió la falla</strong>
      </summary>
      <div className="usgs-body">
        {status === "loading" && <p role="status">Consultando al USGS…</p>}
        {status === "error" && (
          <p role="alert">
            No se pudieron cargar los datos del USGS. <button type="button" className="usgs-retry" onClick={loadMainshockDetail}>Reintentar</button>
          </p>
        )}
        {status === "ready" && detail && (
          <>
            {mechanism && (
              <section aria-labelledby="usgs-mech">
                <h3 id="usgs-mech">Mecanismo focal</h3>
                <div className="usgs-mech">
                  <Beachball mechanism={mechanism} />
                  <div>
                    <p><strong>{describeMechanism(mechanism.planes)}</strong></p>
                    <ul>
                      <li>Plano 1: rumbo {deg(mechanism.planes[0].strike)}, buzamiento {deg(mechanism.planes[0].dip)}, deslizamiento {deg(mechanism.planes[0].rake)}</li>
                      <li>Plano 2: rumbo {deg(mechanism.planes[1].strike)}, buzamiento {deg(mechanism.planes[1].dip)}, deslizamiento {deg(mechanism.planes[1].rake)}</li>
                      <li>Magnitud de momento {mechanism.magType} {mechanism.magnitude.toFixed(1)} · {mechanism.reviewed ? "revisado" : "automático"}</li>
                    </ul>
                  </div>
                </div>
                <p className="usgs-note">
                  Es el dibujo habitual de los sismólogos (hemisferio inferior, norte arriba): en las zonas oscuras la primera onda empujó el suelo hacia afuera y en las blancas, hacia adentro. Los dos planos son las dos superficies posibles de la falla: con solo la dirección de las ondas no se puede saber cuál de las dos se movió.
                </p>
              </section>
            )}
            {fault && (
              <section aria-labelledby="usgs-fault">
                <h3 id="usgs-fault">Ruptura de la falla (modelo del USGS)</h3>
                <ul>
                  {fault.lengthKm !== null && fault.widthKm !== null && <li>Tramo modelado: unos {Math.round(fault.lengthKm)} km de largo por {Math.round(fault.widthKm)} km de ancho</li>}
                  {fault.strike !== null && fault.dip !== null && <li>Rumbo {deg(fault.strike)} y buzamiento {deg(fault.dip)}</li>}
                  <li>Deslizamiento máximo: {fault.maxSlipM.toFixed(1)} m</li>
                </ul>
                <p className="usgs-note">Es un modelo calculado por el USGS a partir de sismogramas ({fault.reviewed ? "revisado" : "automático"}). Se dibuja en el mapa con «Ruptura de la falla».</p>
              </section>
            )}
            {felt && (
              <section aria-labelledby="usgs-felt">
                <h3 id="usgs-felt">Lo que reportó la gente</h3>
                <ul>
                  <li>{felt.responses.toLocaleString("es-PA")} respuestas al formulario «¿Lo sentiste?» del USGS</li>
                  {felt.maxIntensity !== null && <li>Intensidad máxima reportada: {felt.maxIntensity.toFixed(1)} (escala Mercalli modificada)</li>}
                </ul>
                <p className="usgs-note">Se dibuja en el mapa con «Lo que sintió la gente», en cuadros de 10 km.</p>
              </section>
            )}
            {!mechanism && !fault && !felt && <p>El USGS no ha publicado más datos de este sismo.</p>}
            <p className="usgs-source">
              Fuente: <a href={detail.url} target="_blank" rel="noopener noreferrer">ficha del sismo en el USGS<span aria-hidden="true"> ↗</span></a>. Datos publicados por el Servicio Geológico de Estados Unidos; esta página solo los muestra.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
