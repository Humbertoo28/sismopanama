"use client";

import { useSyncExternalStore } from "react";
import "./clarification-notice.css";

// Aclaración pública sobre la alerta falsa del 13 de octubre de 2026 (sismo «M 4.0» cerca de Juan Díaz que solo traía el EMSC). Se ve
// en la portada hasta EXPIRES, o hasta que la persona la cierre (queda cerrada en su dispositivo). Más detalle en el README.
const KEY = "clar-juan-diaz-2026-10-13";
const EXPIRES = Date.parse("2026-10-21T00:00:00-05:00");

const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
};

function visible() {
  if (Date.now() >= EXPIRES) return false;
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return true; // sin almacenamiento (modo privado o vista integrada): se muestra
  }
}

export default function ClarificationNotice() {
  // En el servidor no se sabe qué ya cerró la persona: no se dibuja y el navegador la muestra al hidratar.
  const show = useSyncExternalStore(subscribe, visible, () => false);
  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Da igual: solo vuelve a aparecer en la próxima visita.
    }
    listeners.forEach(notify => notify());
  };

  return (
    <section className="clar" aria-labelledby="clar-title">
      <h2 id="clar-title">Aclaración sobre el sismo de Juan Díaz (13 de octubre)</h2>
      <p>
        A las 4:37 p. m. enviamos una alerta por un sismo de M 4.0 cerca de Juan Díaz. Ese registro lo publicó el <b>EMSC</b>
        {" "}(Centro Sismológico Euromediterráneo), un centro sismológico internacional y una de las fuentes oficiales que contrastamos
        junto con el IGC-UP y el USGS. <b>Esta vez el EMSC se equivocó:</b> el IGC-UP indicó que no fue un sismo real y el USGS
        tampoco lo registró.
      </p>
      <p>
        Ya lo quitamos del mapa y de las cifras. Para que no se repita, desde ahora un sismo que solo publica un catálogo no genera
        alertas hasta que otro lo confirme (salvo los de M 5 o más). Lamentamos la confusión.
      </p>
      <button type="button" onClick={dismiss}>Entendido</button>
    </section>
  );
}
