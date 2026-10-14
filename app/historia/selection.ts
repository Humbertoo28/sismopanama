// El sismo elegido vive en la dirección (#sismo=<id>): se puede compartir y sobrevive a recargar la página. Lo leen y lo escriben el
// explorador y el mapa de los 12 más grandes.
export function writeSelection(id: string | null) {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", id ? `${base}#sismo=${id}` : base);
  window.dispatchEvent(new Event("hashchange"));
}

// Con «reducir animaciones» (del sistema o del panel de accesibilidad) el desplazamiento es directo, sin deslizarse.
const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.a11yMotion === "reduce" ? "auto" : "smooth";

// Lleva la vista al explorador (el mapa grande con la ficha del sismo elegido).
export function showExplorer() {
  document.getElementById("hx-explorer")?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
}

// Muestra un elemento solo si no se ve entero (el mínimo desplazamiento posible).
export function revealNearest(element: Element | null) {
  element?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
}
