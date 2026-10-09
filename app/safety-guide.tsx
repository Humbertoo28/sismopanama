"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ALWAYS, GUIDE, PHASES, SITUATIONS, type Phase, type SituationId } from "../lib/safety-guide";

type Props = {
  aftershockCount: number | null;
  strongestAftershock: string | null;
};

export default function SafetyGuide({ aftershockCount, strongestAftershock }: Props) {
  const [situation, setSituation] = useState<SituationId>("casa");
  const [phase, setPhase] = useState<Phase>("durante");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onTabKey = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + PHASES.length) % PHASES.length;
    setPhase(PHASES[next].id);
    tabRefs.current[next]?.focus();
  };

  const tips = GUIDE[situation][phase];
  const always = ALWAYS[phase];

  return (
    <div className="guide-card">
      <div className="guide-step">
        <span className="guide-label" id="guide-where">1 · ¿DÓNDE ESTÁS?</span>
        <div className="guide-chips" role="radiogroup" aria-labelledby="guide-where">
          {SITUATIONS.map(item => (
            <button key={item.id} type="button" role="radio" aria-checked={situation === item.id} className={situation === item.id ? "selected" : ""} onClick={() => setSituation(item.id)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="guide-step">
        <span className="guide-label">2 · ¿EN QUÉ MOMENTO?</span>
        <div className="guide-tabs" role="tablist" aria-label="Momento del sismo">
          {PHASES.map((item, index) => (
            <button key={item.id} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab" id={`guide-tab-${item.id}`} aria-selected={phase === item.id} aria-controls="guide-panel" tabIndex={phase === item.id ? 0 : -1} className={phase === item.id ? "selected" : ""} onClick={() => setPhase(item.id)} onKeyDown={event => onTabKey(event, index)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${phase}`} tabIndex={0} className="guide-panel">
        <ol className="guide-list">
          {tips.map((tip, index) => (
            <li key={tip.title}><span className="guide-num">{String(index + 1).padStart(2, "0")}</span><div><strong>{tip.title}</strong><p>{tip.detail}</p></div></li>
          ))}
        </ol>
        {phase === "replicas" && aftershockCount !== null && aftershockCount > 0 && (
          <p className="guide-live"><strong>Dato en vivo:</strong> el USGS registra {aftershockCount.toLocaleString("es-PA")} {aftershockCount === 1 ? "réplica" : "réplicas"} de este sismo{strongestAftershock ? `, la mayor de M ${strongestAftershock}` : ""}. Es normal que sigan ocurriendo.</p>
        )}
        {always.length > 0 && (
          <div className="guide-always">
            <h3>En todos los casos</h3>
            <ul>{always.map(tip => <li key={tip.title}><strong>{tip.title}.</strong> {tip.detail}</li>)}</ul>
          </div>
        )}
      </div>
      <p className="guide-disclaimer">Recomendaciones generales de seguridad sísmica. Si las autoridades te dan otra indicación, síguela siempre.</p>
    </div>
  );
}
