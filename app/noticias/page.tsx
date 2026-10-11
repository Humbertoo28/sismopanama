import type { Metadata } from "next";
import Link from "next/link";
import { fetchMediaNews, MEDIA, type MediaNews } from "../../lib/media-news";
import { fetchOfficialNews, SOURCES, type NewsItem, type NewsSource, type OfficialNews } from "../../lib/news";
import { OFFICIAL_ACCOUNTS, type OfficialAccount } from "../../lib/official-accounts";
import { pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import "./noticias.css";

const { sinaproc: SINAPROC, meduca: MEDUCA } = SOURCES;

const TITLE = "Noticias sobre el sismo en Panamá";
const DESCRIPTION = "Titulares de Telemetro y TVN y comunicados oficiales de SINAPROC y MEDUCA sobre el sismo del 9 de octubre en Panamá, con el enlace a cada nota.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Sismo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Sismo Panamá`, DESCRIPTION, "/noticias", true),
};

// La página se genera una vez y se renueva como máximo cada 5 minutos: los visitantes reciben la copia ya hecha y las
// entidades y los medios reciben unas pocas consultas, sin importar cuánta gente entre. Debe ser un número literal para que Next lo lea.
export const revalidate = 300;

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

async function loadMedia(): Promise<MediaNews | null> {
  try {
    return await fetchMediaNews();
  } catch (error) {
    console.error("[noticias] No se pudo consultar a ningún medio:", error);
    return null;
  }
}

function MediaList({ items }: { items: MediaNews["items"] }) {
  return (
    <ul className="nw-list">
      {items.map(item => (
        <li key={item.url}>
          <article className="nw-item">
            <div className="nw-meta">
              <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
              <span className="nw-tag nw-tag-media">{MEDIA[item.source].name}</span>
            </div>
            <h3>
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
            </h3>
          </article>
        </li>
      ))}
    </ul>
  );
}

function SourceLink({ source }: { source: Pick<NewsSource, "name" | "url"> }) {
  return <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>;
}

function SourceDown({ source }: { source: Pick<NewsSource, "name" | "url"> }) {
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
  const [news, media] = await Promise.all([loadNews(), loadMedia()]);

  return (
    <div className="nw-root">
      <BreadcrumbStructuredData trail={[{ name: "Sismo Panamá", path: "/" }, { name: "Noticias sobre el sismo", path: "/noticias" }]} />
      <header className="nw-header">
        <Link className="nw-back" href="/">← Panel principal</Link>
        <div className="nw-brand" aria-label="Sismo Panamá"><strong>SISMO</strong><small>PANAMÁ</small></div>
        <span className="nw-spacer" aria-hidden="true" />
      </header>

      <main className="nw-wrap">
        <section className="nw-intro" aria-labelledby="nw-title">
          <h1 id="nw-title">Noticias sobre el sismo</h1>
          <p>
            Lo que se ha publicado sobre el sismo del 9 de octubre: los titulares de <strong>{MEDIA.telemetro.name}</strong> y{" "}
            <strong>{MEDIA.tvn.name}</strong> y los comunicados de <strong>{SINAPROC.name}</strong> ({SINAPROC.fullName}) y{" "}
            <strong>{MEDUCA.name}</strong> ({MEDUCA.fullName}), entidades del Estado panameño. Solo aparece lo publicado desde el 9 de
            octubre; el texto completo está en el sitio de cada uno.
          </p>
        </section>

        <aside className="nw-note" role="note">
          <strong>Esta página no es del gobierno ni de ningún medio.</strong> Solo reúne y enlaza lo que publican {MEDIA.telemetro.name},{" "}
          {MEDIA.tvn.name}, {SINAPROC.name} y {MEDUCA.name}. Ante una emergencia, sigue siempre las indicaciones de{" "}
          <SourceLink source={SINAPROC} />, de <SourceLink source={MEDUCA} /> y de las autoridades de tu zona.
        </aside>

        <section className="nw-section" aria-labelledby="nw-media-title">
          <h2 id="nw-media-title">Titulares de los medios</h2>
          <p className="nw-lead">
            Lo que publican <SourceLink source={MEDIA.telemetro} /> y <SourceLink source={MEDIA.tvn} /> sobre el sismo, desde el 9 de
            octubre: aquí ves solo el titular, y la nota completa está en cada medio.
          </p>
          {media && !media.available.telemetro && <SourceDown source={MEDIA.telemetro} />}
          {media && !media.available.tvn && <SourceDown source={MEDIA.tvn} />}
          {media && media.items.length > 0 && (
            <MediaList items={media.items} />
          )}
          {media && media.items.length === 0 && media.available.telemetro && media.available.tvn && (
            <p className="nw-empty">No se encontraron titulares sobre el sismo en {MEDIA.telemetro.name} ni en {MEDIA.tvn.name} desde el 9 de octubre.</p>
          )}
          {!media && (
            <p className="nw-down" role="status">
              No se pudo consultar a {MEDIA.telemetro.name} ni a {MEDIA.tvn.name} en este momento; se intentará de nuevo en unos minutos.
            </p>
          )}
        </section>

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
              <h2 id="nw-seismic-title">Comunicados oficiales sobre sismos</h2>
              <p className="nw-lead">
                Los comunicados de {SINAPROC.name} y {MEDUCA.name} cuyo título habla de un sismo, una réplica o un tsunami, publicados
                desde el 9 de octubre.
                {news.seismic[0] && <> El más reciente es del <strong>{formatDay(news.seismic[0].publishedAt)}</strong>.</>}
              </p>
              {!news.available.sinaproc && <SourceDown source={SINAPROC} />}
              {!news.available.meduca && <SourceDown source={MEDUCA} />}
              {news.seismic.length > 0 ? (
                <NewsList items={news.seismic} />
              ) : (
                news.available.sinaproc && news.available.meduca && (
                  <p className="nw-empty">
                    {SINAPROC.name} y {MEDUCA.name} no han publicado comunicados sobre sismos en sus sitios web desde el 9 de octubre.
                    {news.lastPublished.sinaproc && <> El último comunicado de {SINAPROC.name} (de cualquier tema) es del {formatDay(news.lastPublished.sinaproc)}</>}
                    {news.lastPublished.meduca && <>{news.lastPublished.sinaproc ? " y el" : " El"} último de {MEDUCA.name} es del {formatDay(news.lastPublished.meduca)}</>}
                    {(news.lastPublished.sinaproc || news.lastPublished.meduca) && "."}
                  </p>
                )
              )}
            </section>

            <section className="nw-section" aria-labelledby="nw-classes-title">
              <h2 id="nw-classes-title">Clases y escuelas</h2>
              <p className="nw-lead">Avisos de {MEDUCA.name} sobre suspensión o reanudación de clases, publicados desde el 9 de octubre.</p>
              {news.available.meduca ? (
                news.classes.length > 0 ? (
                  <NewsList items={news.classes} />
                ) : (
                  <p className="nw-empty">
                    {MEDUCA.name} no ha publicado en su sitio web avisos de suspensión ni de reanudación de clases desde el 9 de octubre.
                    {news.lastPublished.meduca && <> Su última publicación (de cualquier tema) es del {formatDay(news.lastPublished.meduca)}.</>}
                  </p>
                )
              ) : (
                <SourceDown source={MEDUCA} />
              )}
            </section>

            <section className="nw-section" aria-labelledby="nw-latest-title">
              <h2 id="nw-latest-title">Últimos comunicados de {SINAPROC.name}</h2>
              <p className="nw-lead">Todo lo que ha publicado {SINAPROC.name} desde el 9 de octubre, sea o no sobre sismos: avisos de lluvias, simulacros, operativos.</p>
              {news.available.sinaproc ? (
                news.latest.length > 0 ? (
                  <NewsList items={news.latest} />
                ) : (
                  <p className="nw-empty">
                    {SINAPROC.name} no ha publicado comunicados en su sitio web desde el 9 de octubre
                    {news.lastPublished.sinaproc && <>; el último es del {formatDay(news.lastPublished.sinaproc)}</>}.
                  </p>
                )
              ) : (
                <SourceDown source={SINAPROC} />
              )}
            </section>

            <p className="nw-asof">
              Fuentes: <a href={MEDIA.telemetro.url} target="_blank" rel="noopener noreferrer">telemetro.com</a>,{" "}
              <a href={MEDIA.tvn.url} target="_blank" rel="noopener noreferrer">tvn-2.com</a>,{" "}
              <a href={SINAPROC.url} target="_blank" rel="noopener noreferrer">sinaproc.gob.pa</a> y{" "}
              <a href={MEDUCA.url} target="_blank" rel="noopener noreferrer">meduca.gob.pa</a>. Consultado el {formatDate(news.fetchedAt)}{" "}
              (hora de Panamá). La página se renueva sola cada 5 minutos, aproximadamente. Solo aparece lo que cada entidad o medio publica
              en su sitio web: pueden informar antes, o también, por otros canales.
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
