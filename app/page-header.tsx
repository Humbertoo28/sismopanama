import Link from "next/link";
import FlagMark from "./flag-mark";

// Encabezado de las páginas secundarias, con la misma identidad que la página principal: marca a la izquierda y las demás
// páginas a un toque. `current` marca la página en la que se está.
const PAGES = [
  ["/", "Inicio"],
  ["/reportes", "Reportes"],
  ["/analisis", "Gráficos"],
  ["/noticias", "Noticias"],
  ["/historia", "Historia"],
] as const;

export default function PageHeader({ current }: { current: (typeof PAGES)[number][0] }) {
  return (
    <header className="site-header page-header">
      <div className="site-header-bar">
        <Link className="site-brand" href="/" aria-label="Sismo Panamá, inicio">
          <span className="brand-mark" aria-hidden="true"><FlagMark /></span>
          <span>Sismo Panamá</span>
        </Link>
      </div>
      <nav className="page-nav" aria-label="Páginas">
        {PAGES.map(([href, label]) => (
          <Link key={href} href={href} className={href === current ? "active" : ""} aria-current={href === current ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}
