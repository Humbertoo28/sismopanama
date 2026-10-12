import { kmBetween, type Earthquake } from "./earthquakes";
import { DISTRICTS, PLACES } from "./places";
import { firstArrival } from "./travel-time";

export const SOURCE_NAMES = { usgs: "USGS", igc: "IGC", emsc: "EMSC" } as const;

// Solo se enlazan los informes que están en el sitio de cada catálogo (el enlace viene de una fuente ajena).
const REPORT_HOSTS = ["https://earthquake.usgs.gov/", "https://sismosgeociencias.up.ac.pa/", "https://www.emsc-csem.org/"];
export function reportUrl(event: Earthquake | null | undefined) {
  const url = event?.properties.url;
  return url && REPORT_HOSTS.some(host => url.startsWith(host)) ? url : "https://earthquake.usgs.gov/earthquakes/map/";
}

// Datos que la ficha de un sismo calcula a partir de su ubicación, profundidad y magnitud. Todo lo calculado se rotula como
// tal en la pantalla: no son mediciones.

// Superficial: hasta 70 km; intermedio: 70 a 300 km; profundo: más de 300 km (clasificación habitual).
export function depthClass(km: number) {
  return km < 70 ? "superficial" : km <= 300 ? "intermedio" : "profundo";
}

// Energía liberada con la relación de Gutenberg y Richter, log10 E (julios) = 1.5 M + 4.8, y su equivalente en TNT
// (1 tonelada de TNT = 4.184 × 10⁹ julios). Es una aproximación: sirve para comparar, no para medir.
export function energyTnt(mag: number) {
  const tons = 10 ** (1.5 * mag + 4.8) / 4.184e9;
  const round = (value: number) => (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);
  if (tons < 1) return `${Math.max(1, Math.round(tons * 1000))} kilogramos de TNT`;
  if (tons < 1000) return `${Math.round(tons)} ${Math.round(tons) === 1 ? "tonelada" : "toneladas"} de TNT`;
  if (tons < 1e6) return `${round(tons / 1000)} mil toneladas de TNT`;
  const mega = tons / 1e6;
  return `${round(mega)} millones de toneladas de TNT (${round(mega)} megatones)`;
}

const ARRIVAL_PLACES: { name: string; province: string }[] = [
  { name: "Bocas del Toro", province: "bocas-del-toro" },
  { name: "David", province: "chiriqui" },
  { name: "Santiago de Veraguas", province: "veraguas" },
  { name: "Penonomé", province: "cocle" },
  { name: "Chitré", province: "herrera" },
  { name: "Las Tablas", province: "los-santos" },
  { name: "Colón", province: "colon" },
  { name: "La Chorrera", province: "panama-oeste" },
  { name: "La Palma", province: "darien" },
];

// Capitales de provincia y la capital del país, con sus coordenadas de GeoNames (CC BY 4.0).
const CITIES = (() => {
  const list = ARRIVAL_PLACES.flatMap(item => {
    const place = PLACES.find(candidate => candidate.name === item.name && candidate.province === item.province);
    return place ? [{ name: place.name, lat: place.lat, lng: place.lng }] : [];
  });
  const capital = DISTRICTS["0808"];
  return { provincial: list, capital: capital ? { name: "Ciudad de Panamá", lat: capital.lat, lng: capital.lng } : null };
})();

// `seconds`: llegada de la onda S (la sacudida fuerte); `pSeconds`: llegada de la onda P. Ambas con el modelo ak135.
export type ArrivalCity = { name: string; lat: number; lng: number; km: number; seconds: number; pSeconds: number };

function arrivalOf(city: { name: string; lat: number; lng: number }, lat: number, lng: number, depth: number): ArrivalCity {
  const km = kmBetween(lat, lng, city.lat, city.lng);
  return { ...city, km, seconds: firstArrival(km, depth, "s"), pSeconds: firstArrival(km, depth, "p") };
}

/** Distancia a la capital y cuánto tarda en llegar la sacudida fuerte (onda S, modelo ak135) a las tres capitales de provincia más cercanas y a la capital. */
export function arrivals(event: Earthquake) {
  const [lng, lat, depthRaw] = event.geometry.coordinates;
  const depth = Number.isFinite(depthRaw) ? depthRaw! : 10;
  const capital = CITIES.capital ? arrivalOf(CITIES.capital, lat, lng, depth) : null;
  const near = CITIES.provincial.map(city => arrivalOf(city, lat, lng, depth)).sort((a, b) => a.km - b.km).slice(0, 3);
  const list = [...near, ...(capital && !near.some(city => city.name === capital.name) ? [capital] : [])].sort((a, b) => a.km - b.km);
  return { capital, list };
}

/** Texto de «hace N minutos» a partir de una marca de tiempo (milisegundos). */
export function agoLabel(time: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
