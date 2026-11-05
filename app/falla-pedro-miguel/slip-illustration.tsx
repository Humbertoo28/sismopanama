"use client";

import { useEffect, useRef, useState } from "react";

// Ilustración (NO una simulación) de cómo se desplaza una falla de desplazamiento lateral derecho, vista desde arriba y a escala: una
// carretera recta cruza la falla y, al deslizarse, el bloque este baja (al sur) y el oeste sube (al norte) hasta separar los dos tramos. El
// único dato real es el desplazamiento: al menos 2,1 m cerca del Canal en el terremoto de 1621 (Rockwell et al., 2010).

const SLIP_M = 2.1;
const PX_PER_M = 20;
const SLIP_PX = SLIP_M * PX_PER_M;
const W = 640;
const H = 300;
const FAULT_X = W / 2;
const ROAD_Y = H / 2;
const ROAD_HALF = 30; // 3 m de ancho a escala
const DURATION_MS = 2600;
const ease = (t: number) => 1 - (1 - t) ** 3;

export default function SlipIllustration() {
  const [slip, setSlip] = useState(0); // 0 a 1
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const play = () => {
    cancelAnimationFrame(frame.current);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSlip(1);
      return;
    }
    setSlip(0);
    setPlaying(true);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setSlip(ease(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const reset = () => {
    cancelAnimationFrame(frame.current);
    setPlaying(false);
    setSlip(0);
  };

  const east = slip * (SLIP_PX / 2); // el bloque este baja (al sur)
  const west = -slip * (SLIP_PX / 2); // el bloque oeste sube (al norte)
  const meters = slip * SLIP_M;

  const road = (x0: number, x1: number, shift: number) => (
    <g transform={`translate(0 ${shift})`}>
      <rect x={x0} y={ROAD_Y - ROAD_HALF} width={x1 - x0} height={ROAD_HALF * 2} className="si-road" />
      <line x1={x0} x2={x1} y1={ROAD_Y} y2={ROAD_Y} className="si-center" />
    </g>
  );

  return (
    <figure className="si">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="si-title si-desc" className="si-svg">
        <title id="si-title">Cómo se desplaza una falla de desplazamiento lateral derecho, vista desde arriba</title>
        <desc id="si-desc">
          Una carretera recta cruza una falla vertical que va de norte a sur. Al deslizarse la falla, el bloque oeste se mueve hacia el norte y el bloque este hacia
          el sur, y los dos tramos de la carretera quedan desalineados hasta {SLIP_M.toLocaleString("es-PA")} metros.
        </desc>
        {/* Bloques del terreno */}
        <g transform={`translate(0 ${west})`}><rect x={0} y={-20} width={FAULT_X} height={H + 40} className="si-block west" /></g>
        <g transform={`translate(0 ${east})`}><rect x={FAULT_X} y={-20} width={FAULT_X} height={H + 40} className="si-block east" /></g>
        {road(0, FAULT_X, west)}
        {road(FAULT_X, W, east)}
        {/* Falla */}
        <line x1={FAULT_X} x2={FAULT_X} y1={0} y2={H} className="si-fault" />
        {/* Flechas del movimiento */}
        <g className="si-arrows" aria-hidden="true">
          <path d={`M${FAULT_X - 70} ${60} v-34 m-7 9 l7 -9 l7 9`} />
          <path d={`M${FAULT_X + 70} ${H - 60} v34 m-7 -9 l7 9 l7 -9`} />
        </g>
        <text x={FAULT_X - 80} y={22} className="si-text" textAnchor="end">Bloque oeste: al norte</text>
        <text x={FAULT_X + 80} y={H - 14} className="si-text" textAnchor="start">Bloque este: al sur</text>
        <text x={FAULT_X + 8} y={16} className="si-text small" textAnchor="start">falla</text>
        {/* Escala */}
        <g aria-hidden="true">
          <line x1={20} x2={20 + 5 * PX_PER_M} y1={H - 18} y2={H - 18} className="si-scale" />
          <text x={20} y={H - 24} className="si-text small">5 m</text>
        </g>
        {/* Medida del desplazamiento de la carretera */}
        {slip > 0.02 && (
          <g aria-hidden="true">
            <line x1={FAULT_X + 120} x2={FAULT_X + 120} y1={ROAD_Y + west} y2={ROAD_Y + east} className="si-measure" />
            <text x={FAULT_X + 128} y={ROAD_Y + 4} className="si-text" textAnchor="start">{meters.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m</text>
          </g>
        )}
      </svg>

      <div className="si-controls">
        <button type="button" className="btn btn-secondary btn-small" onClick={play} disabled={playing}>▶ Ver el desplazamiento</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={reset}>↺ Volver al inicio</button>
        <label className="si-slider">
          Desplazamiento
          <input type="range" min={0} max={100} value={Math.round(slip * 100)} aria-valuetext={`${meters.toLocaleString("es-PA", { maximumFractionDigits: 1 })} metros`}
            onChange={event => { cancelAnimationFrame(frame.current); setPlaying(false); setSlip(Number(event.target.value) / 100); }} />
          <output>{meters.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m</output>
        </label>
      </div>
      <figcaption>
        Ilustración a escala, vista desde arriba (norte arriba). No es una simulación del terremoto de 1621 ni de uno futuro: muestra cómo se desplaza una falla de
        desplazamiento lateral derecho, en la que, visto desde cualquiera de los dos lados, el bloque de enfrente se mueve hacia la derecha
        (<a href="https://www.usgs.gov/faqs/what-a-fault-and-what-are-different-types" target="_blank" rel="noopener noreferrer">definición del USGS</a>). El único dato real es la
        medida: en el terremoto de 1621 el terreno se desplazó <strong>al menos {SLIP_M.toLocaleString("es-PA")} m</strong> cerca del Canal
        (<a href="https://doi.org/10.1785/0120090342" target="_blank" rel="noopener noreferrer">Rockwell y otros, 2010</a>). La velocidad de la animación es ilustrativa.
      </figcaption>
    </figure>
  );
}
