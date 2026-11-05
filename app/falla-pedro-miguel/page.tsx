import type { Metadata } from "next";
import PageHeader from "../page-header";
import { ACTIVE_FAULTS_SOURCE, FAULT_DEPTH_KM } from "../../lib/active-faults";
import type { Earthquake } from "../../lib/earthquakes";
import { SCENE_BOX, inSceneBox, nearestOnTrace, pedroMiguel, traceLengthKm, type SceneQuake } from "../../lib/fault-geometry";
import { placeEs } from "../../lib/history";
import { loadQuakeData } from "../../lib/load-quakes";
import { PLACES } from "../../lib/places";
import { SITE_NAME, SITE_URL, pageSocial } from "../../lib/site";
import { BreadcrumbStructuredData } from "../structured-data";
import SceneSection from "./scene-section";
import SlipIllustration from "./slip-illustration";
import "../privacidad/privacidad.css";
import "./falla.css";

// Cada afirmación de esta página tiene su fuente enlazada en el mismo párrafo o en «Fuentes». Lo que se verificó al escribirla:
// - Registro de la falla en la base de datos de GEM (gem_active_faults_harmonized.geojson, 4 de noviembre de 2026): tipo «Dextral», inclinación
//   (preferida, mínima, máxima) = (90, 70, 90), velocidad de deslizamiento (5, 3.5, 8) mm/año, precisión de mapeo 1:100 000, referencia
//   Rockwell et al., 2010. El trazado del sitio coincide con la geometría de esa base (60 puntos, diferencia máxima de 7 m).
// - Artículo de la base de datos (Styron y otros, 2020): a las fallas de desplazamiento lateral se les da 90° de inclinación cuando no hay evidencia de
//   movimiento vertical.
// - Ficha del estudio de Rockwell y otros (2010), en el USGS: tres rupturas en la superficie en unos 1 600 años, la última el 2 de mayo de 1621, con al
//   menos 2,1 m de desplazamiento cerca del Canal; un sismo grande podría romper a la vez Limón y Pedro Miguel (más de 40 km, magnitud cercana a 7); las
//   fallas son un peligro sísmico importante para el centro del país, el Canal y la ciudad de Panamá. No se pudo abrir la ficha directamente (el USGS
//   respondió 403): esas cifras se comprobaron con el resumen que devuelve el buscador, con Panamá América (20 de julio de 2023) y con La Estrella.
// - TVN y La Prensa (4 de noviembre de 2026): lo que dijo el director del IGC, los datos del sismo y los efectos.

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

// Localidades de GeoNames (las mismas que usa el sitio en lib/places.ts), en el orden en que aparecen al acercar la escena; el centro histórico de la ciudad de
// Panamá es la Plaza de la Independencia. Las que haya dentro del recuadro y no estén en la lista van al final.
const CITY = { name: "Ciudad de Panamá (centro histórico)", lat: 8.9524, lng: -79.535 };
const PRIORITY = [
  "Arraiján", "Chilibre", "Burunga", CITY.name, "Veracruz", "Vista Alegre", "Nuevo Arraiján", "San Miguelito", "Ancón", "La Chorrera", "Cerro Silvestre", "Nuevo Emperador",
  "Santa Clara", "Puerto Caimito", "Río Congo", "Alcalde Díaz", "Curundú", "Betania", "Bella Vista", "Calidonia", "San Francisco", "La Mitra", "Nuevo San Juan",
];
const inBox = PLACES.filter(place => inSceneBox(place.lat, place.lng));
const LABELS = [
  ...PRIORITY.flatMap(name => (name === CITY.name ? [CITY] : inBox.filter(place => place.name === name).slice(0, 1).map(place => ({ name: place.name, lat: place.lat, lng: place.lng })))),
  ...inBox.filter(place => !PRIORITY.includes(place.name)).map(place => ({ name: place.name, lat: place.lat, lng: place.lng })),
];

const LINKS = {
  gemRepo: "https://github.com/GEMScienceTools/gem-global-active-faults",
  ccaf: "https://doi.org/10.5194/nhess-20-831-2020",
  rockwell: "https://doi.org/10.1785/0120090342",
  rockwellUsgs: "https://pubs.usgs.gov/publication/70036541",
  tvn: "https://www.tvn-2.com/nacionales/sismo-magnitud-3-9-epicentro-arraijan_1_2269526.html",
  prensa: "https://www.prensa.com/sociedad/sismo-de-magnitud-39-se-registra-al-noroeste-de-arraijan/",
  panamaAmerica2023: "https://panamaamerica.com.pa/sociedad/falla-pedro-miguel-como-se-asocio-con-sismo-de-arraijan-1224521",
  estrella: "https://www.laestrella.com.pa/panama/nacional/entendiendo-el-riesgo-sismico-de-la-ciudad-de-panama-GI23814460",
  usgsDepth: "https://www.usgs.gov/faqs/why-do-so-many-earthquakes-occur-a-depth-10km",
  usgsFaults: "https://www.usgs.gov/faqs/what-a-fault-and-what-are-different-types",
  igc: "https://sismosgeociencias.up.ac.pa/",
} as const;

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

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
const year = (time: number) => new Date(time).getUTCFullYear();
const noDot = (text: string) => text.replace(/\.$/, "");

export default async function FallaPedroMiguelPage() {
  const fault = pedroMiguel();
  const [live, history] = await Promise.all([loadQuakeData(), loadHistory()]);
  const recent = (live?.features ?? []).filter(event => event.properties.time >= SEQUENCE_START && inSceneBox(event.geometry.coordinates[1], event.geometry.coordinates[0])).map(toSceneQuake);
  const target = recent.reduce<SceneQuake | null>((best, quake) => (Math.abs(quake.time - HIGHLIGHT_TIME) < (best ? Math.abs(best.time - HIGHLIGHT_TIME) : 120_000) ? quake : best), null);
  const quakes: SceneQuake[] = [...history, ...recent.map(quake => (quake === target ? { ...quake, highlight: true } : quake))].map(quake => {
    const near = nearestOnTrace(quake.lat, quake.lng, fault.lines);
    return { ...quake, traceKm: near.km, traceSide: near.side };
  });
  const highlight = quakes.find(quake => quake.highlight) ?? null;
  const distances = quakes.map(quake => quake.traceKm ?? 0);
  const median = [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)] ?? 0;
  const west = quakes.filter(quake => quake.traceSide === "oeste").length;
  const traceKm = Math.round(fault.lines.reduce((sum, line) => sum + traceLengthKm(line), 0));
  const offset = highlight ? nearestOnTrace(highlight.lat, highlight.lng, fault.lines) : null;
  const early = history.filter(quake => year(quake.time) <= 1998).length;
  const span = history.length > 0 ? [year(Math.min(...history.map(quake => quake.time))), year(Math.max(...history.map(quake => quake.time)))] : null;
  // Los hechos de la ficha de la falla que sí se comprobaron (ver el comentario de arriba): las rupturas y el desplazamiento de 1621.
  const [ruptures, slip] = fault.facts;

  return (
    <>
      <BreadcrumbStructuredData trail={[{ name: SITE_NAME, path: "/" }, { name: TITLE, path: "/falla-pedro-miguel" }]} />
      <PageHeader current="/falla-pedro-miguel" />
      <main className="pv-main fp-main">
        <h1>{TITLE}</h1>
        <p className="pv-updated">Datos publicados, con su fuente. Nada de lo que se ve es un pronóstico: nadie puede predecir cuándo habrá un sismo.</p>
        <p className="fp-prose">
          La falla de Pedro Miguel es una falla activa en tierra. Según <a href={LINKS.prensa} {...ext}>La Prensa</a>, corre paralela al Canal de Panamá, de Chilibre a las cercanías de
          Taboga. Aquí está en 3D: su trazado publicado, un plano ilustrativo hacia abajo y los sismos que se han registrado cerca de ella, cada uno a la profundidad que publicó su catálogo.
        </p>

        <section aria-labelledby="fp-escena">
          <h2 id="fp-escena">El trazado de la falla y los sismos cercanos</h2>
          <SceneSection lines={fault.lines} quakes={quakes} labels={LABELS} />
          <ul className="fp-notes">
            <li>
              <strong>El trazado</strong> es el de la base de datos de fallas activas <a href={LINKS.gemRepo} {...ext}>GEM Global Active Faults</a> (que incluye la <a href={LINKS.ccaf} {...ext}>CCAF-DB</a>{" "}
              de Centroamérica y el Caribe): unos {traceKm} km mapeados a escala 1:100 000, así que su posición real puede diferir de la dibujada. La base cita como referencia de esta falla el estudio de{" "}
              <a href={LINKS.rockwell} {...ext}>Rockwell y otros (2010)</a>.
            </li>
            <li>
              <strong>El plano hacia abajo es ilustrativo.</strong> La base de datos publica el trazado, el tipo de movimiento (lateral derecho) y una inclinación preferida de 90° (vertical), con un rango de 70° a 90°, pero no
              hasta qué profundidad llega: se dibujan {FAULT_DEPTH_KM} km solo para poder verlo. Según el <a href={LINKS.ccaf} {...ext}>artículo de la base de datos</a>, a las fallas de desplazamiento lateral se les da 90° cuando
              no hay evidencia de movimiento vertical: es una convención, no una medición.
            </li>
            <li>
              <strong>Los sismos van a la profundidad que publicó su catálogo</strong>, a escala real (o ×2). Los catálogos suelen fijar 5 o 10 km cuando los datos no alcanzan para calcular la profundidad (
              <a href={LINKS.usgsDepth} {...ext}>explicación del USGS</a>): esos son los círculos con borde punteado, y no son una medición. El relieve del terreno no se representa.
            </li>
            <li>
              <strong>En la vista «de lado (corte)» los sismos no están sobre el plano.</strong> El recuadro de la escena mide unos 30 km de ancho y los sismos quedan a distancias distintas de la traza: de {km1(Math.min(...distances))} a {km1(Math.max(...distances))} km
              (la mitad, a menos de {km1(median)} km; {west} al oeste y {quakes.length - west} al este): que se vean delante del plano rojo no significa que estén en él. Cada sismo dice a cuántos km de la traza está (cálculo propio con las posiciones publicadas, que tienen su margen de error).
            </li>
            <li>
              En la escena hay {quakes.length} sismos
              {span ? <>: {history.length} que el USGS registró aquí entre {span[0]} y {span[1]} (M 2 o más), de los cuales {early} son de {span[0]} a 1998, y los que registran el IGC, el USGS y el EMSC desde el terremoto del 9 de octubre de 2026</> : <>, los registrados desde el terremoto del 9 de octubre de 2026 por el IGC, el USGS y el EMSC</>}.
              La cantidad de sismos pequeños que un catálogo registra depende de su red de estaciones en cada época, así que la escena no sirve para comparar cuántos hubo en cada una.
            </li>
          </ul>
        </section>

        <section aria-labelledby="fp-sismo" className="fp-prose">
          <h2 id="fp-sismo">El sismo del 4 de noviembre de 2026</h2>
          <p>
            A las 5:38 p. m. del 4 de noviembre el Instituto de Geociencias de la Universidad de Panamá (<a href={LINKS.igc} {...ext}>IGC</a>) registró un sismo de magnitud 3.9
            {highlight ? <>. Su tabla lo ubica así: «{highlight.place}», a {highlight.depthKm === null ? "una profundidad sin dato" : `${highlight.depthKm.toLocaleString("es-PA", { maximumFractionDigits: 1 })} km de profundidad`}</> : <> a unos 7 km de profundidad</>}.
            El boletín que reprodujo <a href={LINKS.prensa} {...ext}>La Prensa</a> (estado «revisado») lo da a 5 km al noroeste de Arraiján y 7 km de profundidad. Se sintió en Arraiján y en zonas de la capital
            (<a href={LINKS.tvn} {...ext}>TVN</a>, <a href={LINKS.prensa} {...ext}>La Prensa</a>).
          </p>
          <p>
            Según <a href={LINKS.tvn} {...ext}>TVN</a> y <a href={LINKS.prensa} {...ext}>La Prensa</a>, el director del IGC, Néstor Luque, dijo que, en una evaluación preliminar y por su ubicación, el sismo
            está relacionado con un movimiento de la falla de Pedro Miguel. Aclaró que no guarda relación con la falla Azuero-Soná ni con el terremoto del 9 de octubre, que pueden darse réplicas y que los sismos
            no se pueden predecir. Sinaproc no reportó daños ni heridos, el Canal siguió operando con normalidad y el Metro evacuó de forma preventiva y normalizó las líneas 1 y 2 después de las 7:00 p. m. (La Prensa).
          </p>
          {highlight && offset ? (
            <p>
              <strong>Lo que se ve en la escena (cálculo propio):</strong> con las posiciones publicadas, el epicentro de la tabla del IGC queda a unos <strong>{km1(offset.km)} km al {offset.side}</strong> de la traza dibujada.
              Tanto la traza (mapeada a 1:100 000) como la posición de un sismo pequeño tienen su margen de error, así que esa distancia no desmiente ni confirma la relación: que el sismo sea de esta falla es una
              evaluación del IGC, no algo que esta escena demuestre.
            </p>
          ) : null}
          <p>
            No es el primero: en julio de 2023 otro sismo cerca de Arraiján también fue asociado por el director del IGC con esta falla (<a href={LINKS.panamaAmerica2023} {...ext}>Panamá América, 20 de julio de 2023</a>).
          </p>
        </section>

        <section aria-labelledby="fp-mueve">
          <h2 id="fp-mueve">Cómo se mueve una falla como esta</h2>
          <p className="fp-prose">
            Según la base de datos de GEM, la de Pedro Miguel es una falla de <strong>desplazamiento lateral derecho</strong>: los dos bloques se deslizan de lado, uno respecto del otro, y visto desde cualquiera de
            los dos lados, el bloque de enfrente se mueve hacia la derecha (<a href={LINKS.usgsFaults} {...ext}>definición del USGS</a>). Así se ve ese movimiento, desde arriba y a escala.
          </p>
          <SlipIllustration />
        </section>

        <section aria-labelledby="fp-sabe" className="fp-prose">
          <h2 id="fp-sabe">Lo que se sabe de la falla</h2>
          <ul>
            <li>{noDot(ruptures)} (<a href={LINKS.rockwellUsgs} {...ext}>ficha del estudio de Rockwell y otros, 2010</a>; también <a href={LINKS.panamaAmerica2023} {...ext}>Panamá América</a>).</li>
            <li>{noDot(slip)} (<a href={LINKS.rockwellUsgs} {...ext}>Rockwell y otros, 2010</a>; Panamá América lo da como «al menos dos metros»).</li>
            <li>Se desliza unos 5 mm por año, con un rango de 3,5 a 8 mm, según el registro de la falla en la base de datos de <a href={LINKS.gemRepo} {...ext}>GEM</a>.</li>
            <li>
              Los autores del estudio plantean que un sismo grande podría romper a la vez la falla de Limón y la de Pedro Miguel, a lo largo de más de 40 km y con una magnitud cercana a 7
              (<a href={LINKS.rockwellUsgs} {...ext}>Rockwell y otros, 2010</a>; <a href={LINKS.estrella} {...ext}>La Estrella</a>).
            </li>
            <li>El mismo estudio concluye que estas fallas son un peligro sísmico importante para el centro del país, el Canal y la ciudad de Panamá (<a href={LINKS.rockwellUsgs} {...ext}>ficha del USGS</a>).</li>
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
              Seismological Society of America 100(6):3097-3129, <a href={LINKS.rockwell} {...ext}>doi:10.1785/0120090342</a>, <a href={LINKS.rockwellUsgs} {...ext}>ficha del USGS</a>.
            </li>
            <li>
              <a href={LINKS.gemRepo} {...ext}>GEM Global Active Faults Database</a> (Styron y Pagani, 2020, Earthquake Spectra 36(1_suppl):160-180), con su CCAF-DB: Styron, García-Peláez y Pagani (2020),{" "}
              <a href={LINKS.ccaf} {...ext}>Natural Hazards and Earth System Sciences 20:831-857</a>. {ACTIVE_FAULTS_SOURCE}.
            </li>
            <li><a href={LINKS.tvn} {...ext}>TVN: sismo de magnitud 3.9 con epicentro en Arraiján</a> (4 de noviembre de 2026).</li>
            <li><a href={LINKS.prensa} {...ext}>La Prensa: sismo de magnitud 3.9 al noroeste de Arraiján</a> (4 de noviembre de 2026), con el boletín del IGC.</li>
            <li><a href={LINKS.panamaAmerica2023} {...ext}>Panamá América: falla de Pedro Miguel, cómo se asoció con el sismo de Arraiján</a> (20 de julio de 2023).</li>
            <li><a href={LINKS.estrella} {...ext}>La Estrella: entendiendo el riesgo sísmico de la ciudad de Panamá</a>.</li>
            <li><a href={LINKS.usgsDepth} {...ext}>USGS: ¿por qué tantos sismos ocurren a 10 km de profundidad?</a> y <a href={LINKS.usgsFaults} {...ext}>USGS: qué es una falla y qué tipos hay</a>.</li>
            <li>Sismos: <a href={LINKS.igc} {...ext}>IGC-UP</a>, <a href="https://earthquake.usgs.gov/" {...ext}>USGS</a> y <a href="https://www.emsc-csem.org/" {...ext}>EMSC</a>. Localidades: <a href="https://www.geonames.org/" {...ext}>GeoNames</a> (CC BY 4.0). Imágenes del satélite: Esri, Maxar, Earthstar Geographics.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
