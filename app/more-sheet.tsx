"use client";

import { ChartColumn, ChevronRight, History, Info, MapPin, MessageSquareText, Newspaper, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { InstallRow } from "./pwa-install";

// Panel «Más» de las pestañas del celular y la tablet: ahí no caben las otras páginas en la barra, y escondidas al final de la
// portada costaba encontrarlas. Es un <dialog> nativo: atrapa el foco, se cierra con Escape y devuelve el foco al botón.
const LINKS = [
  ["/reportes", MessageSquareText, "Reportes", "Lo que sintió la gente en cada sismo"],
  ["/analisis", ChartColumn, "Gráficos", "Réplicas por hora, magnitudes y profundidad"],
  ["/noticias", Newspaper, "Noticias", "Titulares y comunicados oficiales"],
  ["/sismos", MapPin, "Por provincia", "Sismos de cada provincia y comarca"],
  ["/historia", History, "Historia", "Sismos grandes en Panamá desde 1900"],
  ["#fuentes", Info, "Fuentes de datos", "De dónde salen los datos y si están al día"],
] as const;

export default function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="more-sheet"
      aria-labelledby="more-sheet-title"
      onClose={onClose}
      // Tocar fuera del panel (el fondo oscuro es el propio <dialog>) lo cierra.
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="more-sheet-body">
        <div className="more-sheet-head">
          <h2 id="more-sheet-title">Más en Ojo Panamá</h2>
          <button type="button" className="more-sheet-close" onClick={onClose} aria-label="Cerrar">
            <X aria-hidden="true" size={22} />
          </button>
        </div>
        <ul>
          {LINKS.map(([href, Icon, label, detail]) => (
            <li key={href}>
              <a href={href} onClick={href.startsWith("#") ? onClose : undefined}>
                <span className="more-sheet-icon" aria-hidden="true"><Icon size={22} /></span>
                <span className="more-sheet-text"><strong>{label}</strong><small>{detail}</small></span>
                <ChevronRight aria-hidden="true" size={20} />
              </a>
            </li>
          ))}
          <InstallRow onDone={onClose} />
        </ul>
      </div>
    </dialog>
  );
}
