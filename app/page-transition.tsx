import { ViewTransition, type ReactNode } from "react";

// Transición entre pantallas. Envuelve el contenido (<main>) de cada página: al navegar con <Link>, lo que sale se desvanece y lo
// que entra sube (o se desliza hacia el lado que corresponde cuando el enlace dice si va «adelante» o «atrás», ver page-header.tsx).
// El encabezado y la barra inferior quedan fuera a propósito: no se mueven (transitions.css).
// Los enlaces comunes (<a>, que cargan la página entera) usan la transición entre documentos del navegador, definida en ese mismo CSS.
// Va en cada página y no en el layout porque el layout no se desmonta al navegar y nunca «entraría» ni «saldría».
const BY_TYPE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page" };

export default function PageTransition({ children }: { children: ReactNode }) {
  return <ViewTransition enter={BY_TYPE} exit={BY_TYPE} default="none">{children}</ViewTransition>;
}
