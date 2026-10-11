import { MAINSHOCK_ID, isAftershock, type Earthquake } from "./earthquakes";
import { placeLabel, whereText } from "./place-of";
import { provinceOfEvent } from "./province-of";

// Resumen de los sismos en frases cortas y sencillas, sin símbolos: sirve para leerlo con lector de pantalla y es el texto que
// se descarga. Los números van con palabras ("7 coma 7", "11 horas con 52 minutos") para que se lean igual en voz alta.

const COMPASS: Record<string, string> = {
  N: "norte", S: "sur", E: "este", W: "oeste", NE: "noreste", NW: "noroeste", SE: "sureste", SW: "suroeste",
  NNE: "norte-noreste", ENE: "este-noreste", ESE: "este-sureste", SSE: "sur-sureste",
  SSW: "sur-suroeste", WSW: "oeste-suroeste", WNW: "oeste-noroeste", NNW: "norte-noroeste",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const decimal = (value: string) => value.replace(/[.,]/, " coma ");

export function magnitudeWords(mag: number | null) {
  return mag === null ? "desconocida" : decimal(mag.toFixed(1));
}

const panamaTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hourCycle: "h23",
});

/** "11 de octubre, 11 horas con 52 minutos de la mañana" (hora de Panamá). */
export function whenWords(time: number) {
  const parts = Object.fromEntries(panamaTime.formatToParts(time).map(part => [part.type, part.value]));
  const hour24 = Number(parts.hour);
  const minute = Number(parts.minute);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 < 12 ? "mañana" : hour24 < 19 ? "tarde" : "noche";
  const minutes = minute === 0 ? "en punto" : `con ${plural(minute, "minuto", "minutos")}`;
  return `${parts.day} de ${parts.month}, ${plural(hour12, "hora", "horas")} ${minutes} de la ${period}`;
}

/** "a 19 kilómetros al este de Tonosí", o "cerca de X" cuando el título no cita ninguna ciudad (EMSC). */
export function plainPlace(event: Earthquake) {
  const label = event.properties.place ?? "";
  const igc = /(\d+(?:[.,]\d+)?)\s*km\s+al?\s+([\wáéíóú-]+)\s+de\s+([^,(]+)/i.exec(label);
  if (igc) return `a ${decimal(igc[1])} kilómetros al ${igc[2]} de ${igc[3].trim()}`;
  const usgs = /(\d+(?:[.,]\d+)?)\s*km\s+([NSEW]{1,3})\s+of\s+([^,(]+)/i.exec(label);
  const direction = usgs ? COMPASS[usgs[2].toUpperCase()] : undefined;
  if (usgs && direction) return `a ${decimal(usgs[1])} kilómetros al ${direction} de ${usgs[3].trim()}`;
  return `cerca de ${placeLabel(event).replace(/\s*\(([^)]*)\)/g, ", $1")}`;
}

function depthWords(event: Earthquake) {
  const depth = event.geometry.coordinates[2];
  return Number.isFinite(depth) ? `profundidad ${plural(Math.round(depth!), "kilómetro", "kilómetros")}` : "profundidad no disponible";
}

/** "Magnitud 4 coma 4. 11 de octubre, 11 horas con 52 minutos de la mañana. A 19 kilómetros… Los Santos, Tonosí. Profundidad…" */
export function quakeSentence(event: Earthquake) {
  const zone = whereText(event).replace(/ · /g, ", ").replace(/\s*\(([^)]*)\)/g, ", $1");
  const place = plainPlace(event);
  const text = [
    `Magnitud ${magnitudeWords(event.properties.mag)}`,
    whenWords(event.properties.time),
    place.charAt(0).toUpperCase() + place.slice(1),
    zone,
    depthWords(event).charAt(0).toUpperCase() + depthWords(event).slice(1),
  ];
  return `${text.join(". ")}.`;
}

export type SummarySection = { heading: string; lines: string[]; ordered?: boolean };
export type QuakeSummary = {
  title: string;
  updated: string;
  /** Cuándo consultó el servidor los catálogos (ms) y cuándo ocurrió el sismo más reciente (ms): la página los usa para decir "hace N minutos". */
  dataTime: number;
  latestTime: number | null;
  sections: SummarySection[];
};

const HOUR = 3_600_000;

export type SummaryOptions = {
  /** Cuándo consultó el servidor los catálogos (EarthquakeResponse.fetchedAt); por omisión, ahora. */
  dataTime?: number;
  /** Qué catálogos respondieron; si alguno no, el resumen lo dice. */
  catalogs?: { usgs: boolean; igc: boolean; emsc: boolean };
};

export function buildSummary(events: Earthquake[], now: number, options: SummaryOptions = {}): QuakeSummary {
  const recent = [...events].sort((a, b) => b.properties.time - a.properties.time);
  const strongest = recent.reduce<Earthquake | null>((best, event) => (!best || (event.properties.mag ?? -1) > (best.properties.mag ?? -1) ? event : best), null);
  const main = recent.find(event => event.id === MAINSHOCK_ID) ?? strongest;
  const aftershocks = main ? recent.filter(event => isAftershock(event, main)) : [];
  const strongestAfter = aftershocks.reduce<Earthquake | null>((best, event) => (!best || (event.properties.mag ?? -1) > (best.properties.mag ?? -1) ? event : best), null);
  const last24 = recent.filter(event => now - event.properties.time <= 24 * HOUR).length;
  const lastHour = recent.filter(event => now - event.properties.time <= HOUR).length;

  const byProvince = new Map<string, number>();
  for (const event of recent) {
    const name = provinceOfEvent(event)?.name ?? "Mar adentro";
    byProvince.set(name, (byProvince.get(name) ?? 0) + 1);
  }
  const top = [...byProvince.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const down = options.catalogs
    ? (["usgs", "igc", "emsc"] as const).filter(key => !options.catalogs![key]).map(key => key.toUpperCase())
    : [];

  const sections: SummarySection[] = [];
  if (recent[0]) sections.push({ heading: "Último sismo registrado", lines: [quakeSentence(recent[0])] });
  if (main) sections.push({ heading: "Sismo principal", lines: [quakeSentence(main)] });
  const figures = [
    main
      ? `Desde el 9 de octubre se han registrado ${plural(recent.length, "sismo", "sismos")} en Panamá: el sismo principal y ${plural(aftershocks.length, "réplica", "réplicas")}.`
      : `Desde el 9 de octubre se han registrado ${plural(recent.length, "sismo", "sismos")} en Panamá.`,
    `En las últimas 24 horas hubo ${plural(last24, "sismo", "sismos")}.`,
    `En la última hora hubo ${plural(lastHour, "sismo", "sismos")}.`,
  ];
  if (strongestAfter) figures.push(`La réplica más fuerte fue de magnitud ${magnitudeWords(strongestAfter.properties.mag)}, ${plainPlace(strongestAfter)}.`);
  sections.push({ heading: "En cifras", lines: figures });
  if (top.length) sections.push({ heading: "Dónde ha temblado más", lines: top.map(([name, count]) => `${name}: ${plural(count, "sismo", "sismos")}.`) });
  sections.push({ heading: "Los 15 sismos más recientes", ordered: true, lines: recent.slice(0, 15).map(quakeSentence) });
  sections.push({
    heading: "Qué hacer en caso de sismo",
    lines: [
      "Mantén la calma.",
      "Agáchate bajo una mesa o un mueble firme.",
      "Cúbrete la cabeza y el cuello.",
      "Sujétate hasta que pare el temblor.",
      "Si hay peligro de vida, llama al 911.",
      "Atiende solo los avisos oficiales de SINAPROC.",
    ],
  });
  sections.push({
    heading: "Sobre estos datos",
    lines: [
      "Los datos vienen del USGS, del Instituto de Geociencias de la Universidad de Panamá y del EMSC, combinados sin duplicados.",
      "Las magnitudes pueden cambiar cuando las agencias las revisan.",
      "Esta información es de referencia y no sustituye los avisos oficiales.",
      ...(down.length ? [`En este momento no responde: ${down.join(", ")}. Los datos pueden estar incompletos.`] : []),
    ],
  });

  return { title: "Resumen de sismos en Panamá", updated: `Datos del ${whenWords(options.dataTime ?? now)}`, dataTime: options.dataTime ?? now, latestTime: recent[0]?.properties.time ?? null, sections };
}

/** El mismo resumen como texto plano (una frase por línea). */
export function summaryToText(summary: QuakeSummary) {
  const blocks = summary.sections.map(section => [
    `${section.heading}:`,
    ...section.lines.map((line, index) => (section.ordered ? `${index + 1}. ${line}` : line)),
  ].join("\n"));
  return [summary.title, summary.updated, ...blocks].join("\n\n") + "\n";
}
