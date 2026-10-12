// Contrasta lib/travel-time.ts con las llegadas reales que publica el USGS (producto phase-data del evento):
//   node --experimental-strip-types scripts/check-travel-time.ts [id del evento del USGS ...]
// Para cada estación a menos de 1 200 km compara el tiempo observado (hora del registro menos hora del origen) con el del modelo.
// @ts-expect-error Node necesita la extensión .ts; el compilador de la web no la admite en importaciones.
import { firstArrival } from "../lib/travel-time.ts";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["us6000u1my", "us6000u1cf"];
for (const id of ids) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = (await (await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=${id}&format=geojson`)).json()) as any;
  const url = detail.properties.products["phase-data"][0].contents["quakeml.xml"].url as string;
  const depth = detail.geometry.coordinates[2] as number;
  const xml = await (await fetch(url)).text();
  const origin = Date.parse(/<origin[^>]*>[\s\S]*?<time>\s*<value>([^<]*)<\/value>/.exec(xml)![1]);
  const picks = new Map<string, number>();
  for (const pick of xml.matchAll(/<pick [^>]*publicID="([^"]*)"[^>]*>([\s\S]*?)<\/pick>/g)) picks.set(pick[1], Date.parse(/<time>\s*<value>([^<]*)<\/value>/.exec(pick[2])![1]));
  const diffs: number[] = [];
  for (const arrival of xml.matchAll(/<arrival[^>]*>([\s\S]*?)<\/arrival>/g)) {
    const field = (tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(arrival[1])?.[1] ?? "";
    const time = picks.get(field("pickID"));
    const km = Number(field("distance")) * 111.195;
    const phase = field("phase");
    if (time === undefined || km > 1200 || !/^[PpSs]/.test(phase)) continue;
    diffs.push(firstArrival(km, depth, /^[Pp]/.test(phase) ? "p" : "s") - (time - origin) / 1000);
  }
  const mean = diffs.reduce((sum, d) => sum + d, 0) / Math.max(1, diffs.length);
  console.log(`${id} (profundidad ${depth} km): ${diffs.length} llegadas, diferencia media ${mean.toFixed(2)} s, máxima ${Math.max(0, ...diffs.map(Math.abs)).toFixed(1)} s`);
}
