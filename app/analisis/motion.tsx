"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

// «Reducir animaciones»: lo pide el sistema (prefers-reduced-motion) o el interruptor del panel de accesibilidad del sitio
// (atributo data-a11y-motion en <html>, ver app/shake.ts). Se vuelve a leer si cambia cualquiera de los dos.
function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-a11y-motion"] });
  return () => {
    query.removeEventListener("change", onChange);
    observer.disconnect();
  };
}
const read = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.a11yMotion === "reduce";

// En el servidor no se sabe: se dibuja con movimiento y el navegador corrige al hidratar.
export const useReducedMotion = () => useSyncExternalStore(subscribe, read, () => false);

// Dice si el elemento ya llegó a la pantalla alguna vez, para que las barras y los números se animen cuando la persona los ve y
// no antes. Si el navegador no puede medirlo (sin IntersectionObserver) o la pestaña está oculta, se da por visto.
export function useInView<T extends Element>(): [(node: T | null) => void, boolean] {
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined" || document.visibilityState === "hidden") {
      setSeen(true);
      return;
    }
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.current?.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.current.observe(node);
  }, []);
  return [ref, seen];
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
