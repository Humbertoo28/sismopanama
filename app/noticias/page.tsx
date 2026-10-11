import type { Metadata } from "next";
import Link from "next/link";
import { fetchOfficialNews, SOURCES, type NewsItem, type NewsSource, type OfficialNews } from "../../lib/news";
import { OFFICIAL_ACCOUNTS, type OfficialAccount } from "../../lib/official-accounts";
import { pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import "./noticias.css";

const { sinaproc: SINAPROC, meduca: MEDUCA } = SOURCES;

const TITLE = "Noticias oficiales sobre sismos en Panamá";
const DESCRIPTION = "Los comunicados que SINAPROC (Protección Civil) y MEDUCA (Ministerio de Educación) publican sobre sismos, emergencias y suspensión de clases, con el enlace al texto completo en sus sitios.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Sismo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Sismo Panamá`, DESCRIPTION, "/noticias", true),
};

// La página se genera una vez y se renueva como máximo cada 10 minutos: los visitantes reciben la copia ya hecha y las
// entidades reciben unas pocas consultas al día, sin importar cuánta gente entre. Debe ser un número literal para que Next lo lea.
export const revalidate = 600;

const dateFormat = new Intl.DateTimeFormat("es-PA", { dateStyle: "long", timeStyle: "short", timeZone: "America/Panama" });
const dayFormat = new Intl.DateTimeFormat("es-PA", { dateStyle: "long", timeZone: "America/Panama" });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));
const formatDay = (iso: string) => dayFormat.format(new Date(iso));

// Si ninguna fuente responde al renovar la página, Next sigue mostrando la última copia buena. En la compilación (y en
// desarrollo) no hay copia anterior: se muestra el aviso de "no disponible" y se reintenta en la siguiente renovación.
async function loadNews(): Promise<OfficialNews | null> {
  try {
    return await fetchOfficialNews();
  } catch (error) {
    console.error("[noticias] No se pudo consultar a ninguna fuente:", error);
    const canKeepPrevious = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
    if (canKeepPrevious) throw error;
    return null;
  }
}

function SourceLink({ source }: { source: NewsSource }) {
  return <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>;
}

function SourceDown({ source }: { source: NewsSource }) {
  return (
    <p className="nw-down" role="status">
      No se pudo consultar a {source.name} en este momento; se intentará de nuevo en unos minutos. Puedes leerlo directamente en{" "}
      <SourceLink source={source} />.
    </p>
  );
}

function AccountList({ accounts }: { accounts: OfficialAccount[] }) {
  return (
    <ul className="nw-accounts">
      {accounts.map(account => (
        <li key={account.id} className="nw-account">
          <h3>{account.name}</h3>
          <p>{account.role}</p>
          <ul className="nw-links" aria-label={`Redes de ${account.name}`}>
            {account.links.map(link => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function NewsList({ items }: { items: NewsItem[] }) {
  return (
    <ul className="nw-list">
      {items.map(item => (
        <li key={item.id}>
          <article className="nw-item">
            <div className="nw-meta">
              <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
              {item.sismico && <span className="nw-tag">Sismos</span>}
              {item.clases && <span className="nw-tag nw-tag-classes">Clases</span>}
            </div>
            <h3>
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
            </h3>
            {item.summary && <p>{item.summary}</p>}
            <span className="nw-source">Fuente: {SOURCES[item.source].name}</span>
          </article>
        </li>
      ))}
    </ul>
  );
}

export default async function NoticiasPage() {
  const news = await loadNews();

  return (
    <div className="nw-root">
      <BreadcrumbStructuredData trail={[{ name: "Sismo Panamá", path: "/" }, { name: "Noticias oficiales", path: "/noticias" }]} />
      <header className="nw-header">
        <Link className="nw-back" href="/">← Panel principal</Link>
        <div className="nw-brand" aria-label="Sismo Panamá"><strong>SISMO</strong><small>PANAMÁ</small></div>
        <span className="nw-spacer" aria-hidden="true" />
      </header>

      <main className="nw-wrap">
        <section className="nw-intro" aria-labelledby="nw-title">
          <h1 id="nw-title">Noticias oficiales</h1>
          <p>
            Los comunicados que publican <strong>{SINAPROC.name}</strong> ({SINAPROC.fullName}) y <strong>{MEDUCA.name}</strong>{" "}
            ({MEDUCA.fullName}), entidades del Estado panameño. Aquí ves el título y un extracto de cada uno; el texto completo está
            en su sitio.
          </p>
        </section>

        <aside className="nw-note" role="note">
          <strong>Esta página no es del gobierno.</strong> Solo reúne y enlaza lo que publican {SINAPROC.name} y {MEDUCA.name}. Ante una
          emergencia, sigue siempre las indicaciones de <SourceLink source={SINAPROC} />, de <SourceLink source={MEDUCA} /> y de las
          autoridades de tu zona.
        </aside>

        <section className="nw-section" aria-labelledby="nw-accounts-title">
          <h2 id="nw-accounts-title">Cuentas oficiales en redes</h2>
          <p className="nw-lead">
            Las entidades suelen avisar primero en sus redes que en su sitio web. Estas son las cuentas que cada una publica en su
            página oficial (la del IGC se confirmó en su perfil de X). Esta página no copia lo que publican: te lleva a ellas.
          </p>
          <AccountList accounts={OFFICIAL_ACCOUNTS.filter(account => account.primary)} />
          <details className="nw-more">
            <summary>Más cuentas: educación, salud y universidades</summary>
            <AccountList accounts={OFFICIAL_ACCOUNTS.filter(account => !account.primary)} />
          </details>
        </section>

        {news ? (
          <>
            <section className="nw-section" aria-labelledby="nw-seismic-title">
              <h2 id="nw-seismic-title">Comunicados sobre sismos</h2>
              <p className="nw-lead">
                Los comunicados cuyo título habla de un sismo, una réplica o un tsunami.
                {news.seismic[0] && <> El más reciente es del <strong>{formatDay(news.seismic[0].publishedAt)}</strong>.</>}
              </p>
              {!news.available.sinaproc && <SourceDown source={SINAPROC} />}
              {!news.available.meduca && <SourceDown source={MEDUCA} />}
              {news.seismic.length > 0 ? (
                <NewsList items={news.seismic} />
              ) : (
                news.available.sinaproc && news.available.meduca && (
                  <p className="nw-empty">No se encontraron comunicados sobre sismos entre los publicados por {SINAPROC.name} y {MEDUCA.name}.</p>
                )
              )}
            </section>

            <section className="nw-section" aria-labelledby="nw-classes-title">
              <h2 id="nw-classes-title">Clases y escuelas</h2>
              <p className="nw-lead">Avisos de {MEDUCA.name} sobre suspensión o reanudación de clases.</p>
              {news.available.meduca ? (
                news.classes.length > 0 ? (
                  <NewsList items={news.classes} />
                ) : (
                  <p className="nw-empty">
                    {MEDUCA.name} no ha publicado avisos de suspensión ni de reanudación de clases en sus últimas publicaciones
                    {news.meducaCoversSince && <>, que llegan hasta el {formatDay(news.meducaCoversSince)}</>}.
                  </p>
                )
              ) : (
                <SourceDown source={MEDUCA} />
              )}
            </section>

            <section className="nw-section" aria-labelledby="nw-latest-title">
              <h2 id="nw-latest-title">Últimos comunicados de {SINAPROC.name}</h2>
              <p className="nw-lead">Todo lo más reciente que ha publicado {SINAPROC.name}, sea o no sobre sismos: avisos de lluvias, simulacros, operativos.</p>
              {news.available.sinaproc ? <NewsList items={news.latest} /> : <SourceDown source={SINAPROC} />}
            </section>

            <p className="nw-asof">
              Fuentes: <a href={SINAPROC.url} target="_blank" rel="noopener noreferrer">sinaproc.gob.pa</a> y{" "}
              <a href={MEDUCA.url} target="_blank" rel="noopener noreferrer">meduca.gob.pa</a>. Consultado el {formatDate(news.fetchedAt)}{" "}
              (hora de Panamá). La página se renueva sola cada 10 minutos, aproximadamente. Solo aparece lo que cada entidad publica en su
              sitio web: pueden informar antes, o también, por otros canales.
            </p>
          </>
        ) : (
          <section className="nw-state" role="status">
            <h2>No se pudieron cargar los comunicados</h2>
            <p>
              En este momento no pudimos consultar los sitios de {SINAPROC.name} ni de {MEDUCA.name}. Esta página lo intentará de nuevo
              en unos minutos. Mientras tanto puedes leerlos directamente en <SourceLink source={SINAPROC} /> y{" "}
              <SourceLink source={MEDUCA} />.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
