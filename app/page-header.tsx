import Link from "next/link";
import type { ReactNode } from "react";
import FlagMark from "./flag-mark";
import ThemeToggle from "./theme-toggle";

// Encabezado de las páginas secundarias, con la misma identidad que la página principal: marca a la izquierda y las demás
// páginas a un toque. `current` marca la página en la que se está.
const PAGES = [
  ["/", "Inicio"],
  ["/reportes", "Reportes"],
  ["/analisis", "Gráficos"],
  ["/noticias", "Noticias"],
  ["/historia", "Historia"],
] as const;

// `children`: algo propio de la página que va en la barra, junto al botón del tema (por ejemplo, «En vivo» en Gráficos).
// `current`: la página en la que se está (si no está en el menú, como el resumen, ninguna queda marcada).
export default function PageHeader({ current, children }: { current: string; children?: ReactNode }) {
  return (
    <header className="site-header page-header">
      <div className="site-header-bar">
        <Link className="site-brand" href="/" aria-label="Sismo Panamá, inicio">
          <span className="brand-mark" aria-hidden="true"><FlagMark /></span>
          <span>Sismo Panamá</span>
        </Link>
        <div className="page-header-tools">
          {children}
          <ThemeToggle />
        </div>
      </div>
      <nav className="page-nav" aria-label="Páginas">
        {PAGES.map(([href, label]) => (
          <Link key={href} href={href} className={href === current ? "active" : ""} aria-current={href === current ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}
