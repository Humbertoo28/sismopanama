import type { Metadata } from "next";
import PageHeader from "../page-header";
import { ACTIVE_FAULTS_SOURCE, FAULT_DEPTH_KM } from "../../lib/active-faults";
import type { Earthquake } from "../../lib/earthquakes";
import { SCENE_BOX, inSceneBox, nearestOnTrace, pedroMiguel, traceLengthKm, type SceneQuake } from "../../lib/fault-geometry";
import { placeEs } from "../../lib/history";
import { loadQuakeData } from "../../lib/load-quakes";
import { SITE_NAME, SITE_URL, pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import SceneSection from "./scene-section";
import SlipIllustration from "./slip-illustration";
import "../privacidad/privacidad.css";
import "./falla.css";

const TITLE = "La falla de Pedro Miguel en 3D";
const DESCRIPTION = "Escena 3D de la falla activa de Pedro Miguel, junto al Canal, con los sismos registrados cerca de ella y una ilustración de cómo se desplaza una falla de desplazamiento lateral derecho. Solo datos publicados, con su fuente.";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Ojo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | ${SITE_NAME}`, DESCRIPTION, "/falla-pedro-miguel", true),
};

export const revalidate = 600;

const SEQUENCE_START = Date.parse("2026-10-09T00:00:00Z");
// El sismo de las 5:38:14 p. m. del 4 de noviembre de 2026, a 5 km al noroeste de Arraiján, que el director del IGC relacionó con la falla.
const HIGHLIGHT_TIME = Date.parse("2026-11-04T17:38:14-05:00");

const LABELS = [
  { name: "Arraiján", lat: 8.94, lng: -79.64 },
  { name: "Burunga", lat: 8.962, lng: -79.672 },
  { name: "Chilibre", lat: 9.154, lng: -79.62 },
  { name: "Ciudad de Panamá", lat: 8.9524, lng: -79.535 },
];

type UsgsFeature = { id: string; properties: { mag: number | null; place: string | null; time: number }; geometry: { coordinates: [number, number, number?] } };

// Sismos que el USGS registró en el recuadro entre 1990 y la víspera del terremoto del 9 de octubre de 2026 (M 2 o más). Desde esa fecha se usan los
// del sitio (IGC, USGS y EMSC combinados), para no contar dos veces un mismo sismo.
async function loadHistory(): Promise<SceneQuake[]> {
  try {
    const params = new URLSearchParams({
      format: "geojson", orderby: "time", minmagnitude: "2", limit: "500",
      starttime: "1990-01-01", endtime: "2026-10-09",
      minlatitude: String(SCENE_BOX.south), maxlatitude: String(SCENE_BOX.north), minlongitude: String(SCENE_BOX.west), maxlongitude: String(SCENE_BOX.east),
    });
    const response = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`, { headers: { Accept: "application/geo+json, application/json" }, next: { revalidate: 86_400 } });
    if (!response.ok) throw new Error(`USGS respondió ${response.status}`);
    const data = (await response.json()) as { features?: UsgsFeature[] };
    return (data.features ?? []).flatMap(item => {
      const [lng, lat, depth] = item.geometry.coordinates;
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(item.properties.time)) return [];
      return [{ id: item.id, time: item.properties.time, mag: item.properties.mag, depthKm: Number.isFinite(depth) ? depth! : null, lat, lng, place: placeEs(item.properties.place ?? "Panamá"), source: "usgs" as const }];
    });
  } catch (error) {
    console.error("Historial del USGS no disponible para la página de la falla:", error);
    return [];
  }
}

function toSceneQuake(event: Earthquake): SceneQuake {
  const [lng, lat, depth] = event.geometry.coordinates;
  return {
    id: event.id, time: event.properties.time, mag: event.properties.mag, depthKm: Number.isFinite(depth) ? depth! : null, lat, lng,
    place: event.properties.place ?? "Panamá", source: event.properties.magSource ?? event.properties.source ?? "usgs",
  };
}

const km1 = (value: number) => value.toLocaleString("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function FallaPedroMiguelPage() {
  const fault = pedroMiguel();
  const [live, history] = await Promise.all([loadQuakeData(), loadHistory()]);
  const recent = (live?.features ?? []).filter(event => event.properties.time >= SEQUENCE_START && inSceneBox(event.geometry.coordinates[1], event.geometry.coordinates[0])).map(toSceneQuake);
  const target = recent.reduce<SceneQuake | null>((best, quake) => (Math.abs(quake.time - HIGHLIGHT_TIME) < (best ? Math.abs(best.time - HIGHLIGHT_TIME) : 120_000) ? quake : best), null);
  const quakes: SceneQuake[] = [...history, ...recent.map(quake => (quake === target ? { ...quake, highlight: true } : quake))];
  const highlight = quakes.find(quake => quake.highlight) ?? null;
  const traceKm = Math.round(fault.lines.reduce((sum, line) => sum + traceLengthKm(line), 0));
  const offset = highlight ? nearestOnTrace(highlight.lat, highlight.lng, fault.lines) : null;
  const years = history.length > 0 ? [new Date(Math.min(...history.map(quake => quake.time))).getUTCFullYear(), new Date(Math.max(...history.map(quake => quake.time))).getUTCFullYear()] : null;

  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: SITE_NAME, path: "/" }, { name: TITLE, path: "/falla-pedro-miguel" }]} />
      <PageHeader current="/falla-pedro-miguel" />
      <main className="pv-main fp-main">
        <h1>{TITLE}</h1>
        <p className="pv-updated">Datos publicados, con su fuente. Nada de lo que se ve es un pronóstico: nadie puede predecir cuándo habrá un sismo.</p>
        <p className="fp-prose">
          La falla de Pedro Miguel es una falla activa en tierra que corre de norte a sur junto al Canal, cerca de las esclusas de Pedro Miguel, entre Arraiján y la
          ciudad de Panamá. Aquí está en 3D: el trazado publicado, su plano hacia abajo y los sismos que se han registrado cerca de ella, cada uno a la profundidad
          que publicó su catálogo.
        </p>

        <section aria-labelledby="fp-escena">
          <h2 id="fp-escena">La falla bajo Arraiján y el Canal</h2>
          <SceneSection lines={fault.lines} quakes={quakes} labels={LABELS} />
          <ul className="fp-notes">
            <li><strong>El trazado</strong> es el de la base de datos de fallas activas CCAF-DB / GEM: unos {traceKm} km mapeados, a escalas de 1:75 000 a 1:300 000, así que su posición real puede diferir unos cientos de metros.</li>
            <li><strong>El plano hacia abajo es ilustrativo.</strong> La base de datos publica el trazado, la inclinación (vertical) y el sentido del movimiento, pero no hasta qué profundidad llega: se dibujan {FAULT_DEPTH_KM} km, un grosor típico de la corteza que se rompe en estos sismos.</li>
            <li><strong>Los sismos van a la profundidad que publicó su catálogo</strong>, a escala real (o ×2). El catálogo suele asignar 0, 5 o 10 km cuando no logra calcularla: esos son los círculos con borde punteado, y no son una medición. El relieve del terreno no se representa.</li>
            <li>
              En la escena hay {quakes.length} sismos
              {years ? <>: los que el USGS registró aquí de {years[0]} a {years[1]} (M 2 o más; casi todos de 1997 y 1998) y los que registran el IGC, el USGS y el EMSC desde el terremoto del 9 de octubre de 2026</> : <>, los registrados desde el terremoto del 9 de octubre de 2026 por el IGC, el USGS y el EMSC</>}.
              Un catálogo no registra igual los sismos pequeños de todas las épocas, así que la escena no sirve para comparar cuántos hubo en cada una.
            </li>
          </ul>
        </section>

        <section aria-labelledby="fp-sismo" className="fp-prose">
          <h2 id="fp-sismo">El sismo del 4 de noviembre de 2026</h2>
          <p>
            A las 5:38 p. m. del 4 de noviembre el Instituto de Geociencias de la Universidad de Panamá (IGC) registró un sismo de magnitud 3.9
            {highlight ? <>: «{highlight.place}», a {highlight.depthKm === null ? "una profundidad sin dato" : `${highlight.depthKm.toLocaleString("es-PA", { maximumFractionDigits: 1 })} km de profundidad`}</> : <>, a unos 5 km al noroeste de Arraiján y 7 km de profundidad (boletín revisado)</>}.
            Se sintió en Arraiján y en zonas de la capital.
          </p>
          <p>
            Según TVN y La Prensa, el director del IGC, Néstor Luque, dijo que, en una evaluación preliminar y por su ubicación, el sismo está relacionado con un movimiento de la
            falla de Pedro Miguel. Aclaró que no guarda relación con la falla Azuero-Soná ni con el terremoto del 9 de octubre, que pueden darse réplicas y que los sismos no se
            pueden predecir. Sinaproc no reportó daños ni heridos, el Canal siguió operando con normalidad y el Metro evacuó de forma preventiva y normalizó las líneas 1 y 2 después
            de las 7:00 p. m.
          </p>
          {highlight && offset ? (
            <p>
              <strong>Lo que se ve en la escena:</strong> con las posiciones publicadas, el epicentro queda a unos <strong>{km1(offset.km)} km al {offset.side}</strong> de la traza dibujada. La traza
              está mapeada a una escala que deja un margen de cientos de metros y la posición de un sismo pequeño también tiene el suyo, así que esa distancia no desmiente ni confirma la
              relación: que el sismo sea de esta falla es una evaluación del IGC, no algo que esta escena demuestre.
            </p>
          ) : null}
          <p>
            No es el primero: en julio de 2023 otro sismo cerca de Arraiján también fue asociado por el director del IGC con esta falla (Panamá América, 20 de julio de 2023).
          </p>
        </section>

        <section aria-labelledby="fp-mueve">
          <h2 id="fp-mueve">Cómo se mueve una falla como esta</h2>
          <p className="fp-prose">
            La de Pedro Miguel es una falla de <strong>desplazamiento lateral derecho</strong>: casi vertical, con los dos bloques deslizándose de lado, uno respecto del otro. Así se
            ve ese movimiento, desde arriba y a escala.
          </p>
          <SlipIllustration />
        </section>

        <section aria-labelledby="fp-sabe" className="fp-prose">
          <h2 id="fp-sabe">Lo que se sabe de la falla</h2>
          <ul>
            {fault.facts.map(fact => <li key={fact}>{fact}</li>)}
            <li>Forma un mismo sistema con la falla de Limón, más al norte: juntas podrían romperse en un solo sismo de magnitud cercana a 7, a lo largo de más de 40 km.</li>
            <li>La Prensa la describe corriendo paralela al Canal, de Chilibre a las cercanías de Taboga.</li>
            <li>Los estudios (Rockwell y otros, 2010) concluyen que estas fallas son un peligro sísmico importante para el centro del país, el Canal y la ciudad de Panamá.</li>
          </ul>
          <h2>Lo que esta página no hace</h2>
          <ul>
            <li>No predice cuándo ni de qué magnitud será el próximo sismo, ni calcula cuánto temblaría en cada barrio: eso serían estimaciones y aquí solo hay datos publicados.</li>
            <li>No sabe hasta dónde llega la falla en profundidad ni muestra el relieve del terreno.</li>
            <li>No asigna sismos a la falla: lo que dice de la relación con el del 4 de noviembre es lo que dijo el IGC.</li>
          </ul>
          <p>
            Vivir cerca de una falla no cambia qué hacer durante un sismo: agáchate, cúbrete y sujétate. Más en <a href={`${SITE_URL}/#recomendaciones`}>la guía de seguridad</a>.
          </p>
        </section>

        <section aria-labelledby="fp-fuentes" className="fp-prose fp-sources">
          <h2 id="fp-fuentes">Fuentes</h2>
          <ul>
            <li>
              Rockwell, Gath, González y otros (2010), «Neotectonics and paleoseismology of the Limón and Pedro Miguel faults in Panamá: earthquake hazard to the Panamá Canal», Bulletin of the
              Seismological Society of America 100(6):3097-3129,{" "}
              <a href="https://pubs.usgs.gov/publication/70036541" target="_blank" rel="noopener noreferrer">ficha del USGS</a> (doi:10.1785/0120090342).
            </li>
            <li>{ACTIVE_FAULTS_SOURCE}. Styron, García-Peláez y Pagani (2020), Natural Hazards and Earth System Sciences 20:831-857; Styron y Pagani (2020), Earthquake Spectra 36(1_suppl):160-180.</li>
            <li><a href="https://www.tvn-2.com/nacionales/sismo-magnitud-3-9-epicentro-arraijan_1_2269526.html" target="_blank" rel="noopener noreferrer">TVN: sismo de magnitud 3.9 con epicentro en Arraiján</a> (4 de noviembre de 2026).</li>
            <li><a href="https://www.prensa.com/sociedad/sismo-de-magnitud-39-se-registra-al-noroeste-de-arraijan/" target="_blank" rel="noopener noreferrer">La Prensa: sismo de magnitud 3.9 al noroeste de Arraiján</a>, con el boletín del IGC.</li>
            <li><a href="https://panamaamerica.com.pa/sociedad/falla-pedro-miguel-como-se-asocio-con-sismo-de-arraijan-1224521" target="_blank" rel="noopener noreferrer">Panamá América: falla de Pedro Miguel, cómo se asoció con el sismo de Arraiján</a> (20 de julio de 2023).</li>
            <li>Sismos: <a href="https://sismosgeociencias.up.ac.pa/" target="_blank" rel="noopener noreferrer">IGC-UP</a>, <a href="https://earthquake.usgs.gov/" target="_blank" rel="noopener noreferrer">USGS</a> y <a href="https://www.emsc-csem.org/" target="_blank" rel="noopener noreferrer">EMSC</a>. Imágenes del satélite: Esri, Maxar, Earthstar Geographics.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
