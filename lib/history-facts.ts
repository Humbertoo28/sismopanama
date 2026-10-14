import { distanceKm, formatDateUTC, formatMag, historyUrl, yearOf, yearsBetween, type HistoricQuake } from "./history";

// «Datos curiosos» de cada sismo de la historia. Regla: ningún dato sale de la memoria ni de un texto escrito a mano sin comprobar; cada
// uno viene de un registro y dice cuál (`source`): el catálogo del USGS, un producto del USGS (ShakeMap, «¿Lo sentiste?»), la base de
// datos de NOAA NCEI (ver noaa-history.ts) o un cálculo hecho aquí con las fechas y posiciones del catálogo. Si no hay dato, no se
// inventa uno: ese sismo muestra menos curiosidades.

export type FactSource =
  | { kind: "calc"; label: string; url: string }
  | { kind: "usgs"; label: string; url: string }
  | { kind: "noaa"; label: string; url: string; data: string };

export type Fact = {
  id: string;
  text: string;
  source: FactSource;
  // El texto exacto de la fuente (en inglés) de donde sale el dato, para poder compararlo; y una nota sobre cómo leerlo.
  original?: string;
  note?: string;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-PA")} ${n === 1 ? one : many}`;
const ordinal = (n: number) => `${n}.º`;

// Cuánto pasó entre dos fechas, dicho como una persona: «4 años y 120 días», «36 días», «5 horas».
export function spanText(from: number, to: number) {
  const hours = (to - from) / 3_600_000;
  if (hours < 24) return hours < 1 ? "menos de una hora" : plural(Math.round(hours), "hora", "horas");
  const years = yearsBetween(from, to);
  const anniversary = new Date(from);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + years);
  const days = Math.floor((to - anniversary.getTime()) / 86_400_000);
  if (years < 1) return plural(days, "día", "días");
  return days > 0 ? `${plural(years, "año", "años")} y ${plural(days, "día", "días")}` : plural(years, "año", "años");
}

export type FactContext = { capital: { name: string; lat: number; lng: number } | null };

const calc = (label = "Calculado aquí con las fechas y posiciones del catálogo ComCat del USGS"): FactSource => ({ kind: "calc", label, url: historyUrl() });

// Lo que se calcula con el propio catálogo: no depende de ninguna otra fuente y se puede rehacer con los datos de la tabla.
export function computedFacts(quake: HistoricQuake, all: HistoricQuake[], context: FactContext): Fact[] {
  const list: Fact[] = [];
  const byTime = [...all].sort((a, b) => a.time - b.time);
  const index = byTime.findIndex(item => item.id === quake.id);
  const year = yearOf(quake.time);

  // Su lugar por magnitud dentro de su década.
  const decade = Math.floor(year / 10) * 10;
  const sameDecade = all.filter(item => Math.floor(yearOf(item.time) / 10) * 10 === decade);
  const place = sameDecade.filter(item => item.mag > quake.mag || (item.mag === quake.mag && item.time > quake.time)).length + 1;
  list.push({
    id: "decade",
    text: place === 1
      ? `Fue el sismo de mayor magnitud de los ${sameDecade.length} de M 6 o más de la década de ${decade}.`
      : `Por magnitud fue el ${ordinal(place)} de los ${sameDecade.length} sismos de M 6 o más de la década de ${decade}.`,
    source: calc(),
  });

  // Cuánto pasó desde el sismo anterior de la lista.
  if (index > 0) {
    const before = byTime[index - 1];
    list.push({
      id: "previous",
      text: `Pasaron ${spanText(before.time, quake.time)} desde el sismo anterior de la lista (${formatDateUTC(before.time)}, M ${formatMag(before.mag)}).`,
      source: calc(),
    });
  } else {
    list.push({ id: "previous", text: "Es el primero de la lista: el catálogo del USGS no trae otro sismo de M 6 o más en Panamá antes de él, desde 1900.", source: calc() });
  }

  // Cuántos hubo ese año.
  const sameYear = byTime.filter(item => yearOf(item.time) === year);
  list.push({
    id: "year",
    text: sameYear.length === 1
      ? `Fue el único sismo de M 6 o más de ${year} en la lista.`
      : `La lista registra ${sameYear.length} sismos de M 6 o más en ${year}; este fue el ${ordinal(sameYear.findIndex(item => item.id === quake.id) + 1)} del año.`,
    source: calc(),
  });

  // El sismo más cercano de la lista (por su posición publicada).
  const others = all.filter(item => item.id !== quake.id);
  if (others.length) {
    let nearest = others[0];
    let nearestKm = distanceKm(quake, nearest);
    for (const item of others) {
      const km = distanceKm(quake, item);
      if (km < nearestKm) {
        nearest = item;
        nearestKm = km;
      }
    }
    list.push({
      id: "nearest",
      text: `El sismo de la lista con la posición publicada más cercana a esta es el de ${formatDateUTC(nearest.time)} (M ${formatMag(nearest.mag)}), a ${Math.round(nearestKm)} km.`,
      source: calc(),
    });
  }

  // Si es de los de M 7 o más: cuál fue en orden y cuánto después del anterior.
  if (quake.mag >= 7) {
    const big = byTime.filter(item => item.mag >= 7);
    const position = big.findIndex(item => item.id === quake.id);
    const prev = position > 0 ? big[position - 1] : null;
    list.push({
      id: "m7",
      text: `Es el ${ordinal(position + 1)} de los ${big.length} sismos de M 7 o más de la lista${prev ? `; el anterior fue el de ${yearOf(prev.time)}, ${yearsBetween(prev.time, quake.time)} años antes` : ""}.`,
      source: calc(),
    });
  }

  // Distancia a la capital.
  if (context.capital) {
    const km = Math.round(distanceKm(quake, { ...quake, lat: context.capital.lat, lng: context.capital.lng }));
    list.push({ id: "capital", text: `Su epicentro publicado queda a ${km.toLocaleString("es-PA")} km de ${context.capital.name}.`, source: calc("Calculado aquí con la posición publicada por el USGS y la de la ciudad (GeoNames)") });
  }
  return list;
}

// Lo que el propio USGS publica de sus productos para ese sismo. mmi existe solo si el sismo tiene ShakeMap, y felt y cdi solo si tiene
// «¿Lo sentiste?» (DYFI): así lo muestran los datos del catálogo, y por eso se dicen con esas palabras.
export function usgsFacts(quake: HistoricQuake): Fact[] {
  const source: FactSource = { kind: "usgs", label: "USGS · página del sismo", url: quake.url ?? historyUrl() };
  const list: Fact[] = [];
  if (quake.mmi !== null) {
    list.push({
      id: "shakemap",
      text: `El USGS tiene un ShakeMap de este sismo, con una intensidad máxima estimada de ${quake.mmi.toFixed(1)} en la escala Mercalli modificada.`,
      source,
      note: "Es una estimación del modelo del USGS, no una medición en cada lugar.",
    });
  }
  if (quake.felt !== null) {
    list.push({
      id: "felt",
      text: `${plural(quake.felt, "persona envió", "personas enviaron")} reportes al «¿Lo sentiste?» del USGS${quake.cdi !== null ? `; la intensidad máxima de esos reportes fue ${quake.cdi.toFixed(1)}` : ""}.`,
      source,
    });
  }
  return list;
}
