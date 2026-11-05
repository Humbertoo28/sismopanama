// Genera lib/fault-places.ts: los nombres de lugares que la escena 3D de /falla-pedro-miguel pone cerca de la falla de Pedro Miguel.
//
// Uso (Node 22):
//   curl -sLO https://download.geonames.org/export/dump/PA.zip && unzip -o PA.zip PA.txt
//   node --experimental-strip-types --no-warnings scripts/build-fault-places.mjs ruta/a/PA.txt
//
// Fuente: GeoNames (https://www.geonames.org, CC BY 4.0), archivo PA.txt (toda Panamá). Se conserva el id de GeoNames de cada lugar para poder
// comprobarlo. Reglas, todas explícitas:
//  - Solo lo que cae en el recuadro de la escena y a MAX_KM o menos de la traza de la falla (la misma que dibuja la escena).
//  - Localidades: clases P (PPL, PPLX, PPLA2, PPLA3). Se descartan las «históricas» (PPLQ), los nombres de arroyos («Quebrada …»), los genéricos y una lista
//    corta de entradas que no se pudieron comprobar (calles, urbanizaciones privadas con nombre en inglés, antiguos poblados de la Zona del Canal).
//  - Agua y lugares: una lista cerrada de ids (esclusas, Canal, lago, puentes, aeropuertos, parques, islas, un cerro), con el nombre en español
//    cuando GeoNames solo trae el inglés. Esto es una elección editorial, no un dato de GeoNames.
//  - Si dos localidades se llaman igual, se queda la más cercana a la falla.

import { readFileSync, writeFileSync } from "node:fs";
import { ACTIVE_FAULTS } from "../lib/active-faults.ts";

// lib/fault-geometry.ts importa sin extensión (lo resuelve el empaquetador, no Node): el recuadro se lee de su texto para no duplicar las cifras,
// y la distancia a la traza es la misma cuenta (aproximación plana, de sobra a esta escala).
const geometrySource = readFileSync(new URL("../lib/fault-geometry.ts", import.meta.url), "utf8");
const boxMatch = geometrySource.match(/SCENE_BOX = \{ west: (-?[\d.]+), east: (-?[\d.]+), south: (-?[\d.]+), north: (-?[\d.]+) \}/);
const idMatch = geometrySource.match(/PEDRO_MIGUEL_ID = "([^"]+)"/);
if (!boxMatch || !idMatch) throw new Error("No se encontró SCENE_BOX o PEDRO_MIGUEL_ID en lib/fault-geometry.ts");
const SCENE_BOX = { west: Number(boxMatch[1]), east: Number(boxMatch[2]), south: Number(boxMatch[3]), north: Number(boxMatch[4]) };
const PEDRO_MIGUEL_ID = idMatch[1];
const nearestOnTrace = (lat, lng, lines) => {
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  let km = Infinity;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const [dx, dy] = [(bx - ax) * kx, (by - ay) * 110.57];
      const [px, py] = [(lng - ax) * kx, (lat - ay) * 110.57];
      const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
      km = Math.min(km, Math.hypot(px - t * dx, py - t * dy));
    }
  }
  return { km };
};

const MAX_KM = 7;
const input = process.argv[2];
if (!input) throw new Error("Falta la ruta de PA.txt de GeoNames");

const fault = ACTIVE_FAULTS.find(item => item.id === PEDRO_MIGUEL_ID);
if (!fault) throw new Error("Falta la falla de Pedro Miguel");

// id de GeoNames → [nombre que se muestra, tipo]. Tipo: "water" (agua) o "landmark" (esclusas, puentes, aeropuertos, parques, un cerro).
const CURATED = new Map([
  ["3703441", ["Canal de Panamá", "water"]], // «Panama Canal»; GeoNames trae «Canal de Panamá» entre sus nombres alternativos
  ["3704259", ["Lago de Miraflores", "water"]],
  ["3703181", ["Esclusas de Pedro Miguel", "landmark"]], // «Pedro Miguel Locks» (alternativo en GeoNames: «Esclusas Pedro Miguel»)
  ["3704257", ["Esclusas de Miraflores", "landmark"]], // «Miraflores Locks» (alternativo: «Esclusas Miraflores»)
  ["3700680", ["Puente de las Américas", "landmark"]], // GeoNames lo llama «Thatcher Ferry Bridge», su nombre original (hoy Puente de las Américas)
  ["3704258", ["Puente Miraflores", "landmark"]],
  ["3708598", ["Aeropuerto Panamá Pacífico", "landmark"]], // «Panama Pacific International Airport» (alternativo: «Aeropuerto Internacional Panamá Pacífico»)
  ["3704579", ["Aeropuerto Marcos A. Gelabert", "landmark"]], // «Albrook "Marcos A. Gelabert" International Airport»
  ["12245960", ["Parque Nacional Camino de Cruces", "landmark"]],
  ["13449632", ["Parque Nacional Soberanía", "landmark"]], // el otro «Parque Nacional Soberanía» de GeoNames (7117232) está puesto en la ciudad de Panamá: error, no se usa
  ["3714733", ["Cerro Ancón", "landmark"]],
  ["3700182", ["Isla Venado", "water"]],
  ["3703983", ["Isla Naos", "water"]],
  ["3703033", ["Isla Perico", "water"]],
  ["3709528", ["Isla Flamenco", "water"]],
]);
// Localidades que se descartan: no se pudo comprobar que existan hoy con ese nombre (antiguos poblados de la Zona del Canal, calles, nombres genéricos).
const SKIP_NAMES = new Set(["Toucan Boulevard", "Lacona", "Rousseau", "Calle Cincuenta", "Heights", "Green Fields", "Rainforest Villas", "Embassy Gardens", "Summit Park", "Playa Bonita Village"]);
// GeoNames escribe este nombre sin tildes; se muestra con la ortografía normal.
const RENAME = new Map([["6299898", "Panamá Pacífico"]]);
const PLACE_CODES = new Set(["PPL", "PPLX", "PPLA2", "PPLA3"]);
const SINGLE_GENERIC = new Set(["Cantera", "Perejil", "Monje", "Dos Mares", "Los Ángeles", "La Esperanza", "San José", "El Roble", "Santa María", "La Gloria", "Omar Torrijos"]);

const norm = value => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const inBox = (lat, lng) => lat >= SCENE_BOX.south && lat <= SCENE_BOX.north && lng >= SCENE_BOX.west && lng <= SCENE_BOX.east;

const rows = readFileSync(input, "utf8").split("\n").filter(Boolean).map(line => {
  const c = line.split("\t");
  return { id: c[0], name: c[1], lat: Number(c[4]), lng: Number(c[5]), cls: c[6], code: c[7], pop: Number(c[14]) || 0 };
}).filter(row => inBox(row.lat, row.lng));

const out = [];
for (const row of rows) {
  const km = nearestOnTrace(row.lat, row.lng, fault.lines).km;
  const curated = CURATED.get(row.id);
  if (curated) {
    out.push({ id: row.id, name: curated[0], lat: row.lat, lng: row.lng, kind: curated[1], km, pop: 0 });
  } else if (row.cls === "P" && PLACE_CODES.has(row.code) && km <= MAX_KM && !SKIP_NAMES.has(row.name) && !SINGLE_GENERIC.has(row.name) && !row.name.startsWith("Quebrada ")) {
    out.push({ id: row.id, name: RENAME.get(row.id) ?? row.name, lat: row.lat, lng: row.lng, kind: "place", km, pop: row.pop });
  }
}
// Mismo nombre dos veces: se queda la más cercana a la falla (y la que tiene población).
const best = new Map();
for (const item of out.sort((a, b) => a.km - b.km)) {
  const key = norm(item.name);
  const previous = best.get(key);
  if (!previous || (item.pop > previous.pop && item.kind === "place")) best.set(key, item);
}
const list = [...best.values()].sort((a, b) => a.km - b.km);
for (const [id] of CURATED) if (!list.some(item => item.id === id)) console.warn(`AVISO: el id ${id} de la lista cerrada no está en el recuadro o quedó descartado`);

const round = (value, digits) => Number(value.toFixed(digits));
const body = list.map(item => `  { id: "${item.id}", name: ${JSON.stringify(item.name)}, lat: ${round(item.lat, 4)}, lng: ${round(item.lng, 4)}, kind: "${item.kind}", km: ${round(item.km, 1)}, pop: ${item.pop} },`).join("\n");
writeFileSync(new URL("../lib/fault-places.ts", import.meta.url), `// GENERADO por scripts/build-fault-places.mjs — no se edita a mano. Léelo para ver las reglas.
// Nombres de lugares que la escena 3D de /falla-pedro-miguel muestra cerca de la falla de Pedro Miguel (a ${MAX_KM} km o menos de su traza, más una lista cerrada de
// agua y lugares: esclusas, Canal, puentes, aeropuertos, parques). Fuente: GeoNames (https://www.geonames.org, CC BY 4.0); «id» es el id de GeoNames de cada uno.
// «km» es la distancia horizontal a la traza (cálculo propio con las posiciones publicadas) y «pop» la población que da GeoNames (0 = sin dato).

export type FaultPlace = { id: string; name: string; lat: number; lng: number; kind: "place" | "water" | "landmark"; km: number; pop: number };

export const FAULT_PLACES: FaultPlace[] = [
${body}
];
`);
console.log(`${list.length} lugares (${list.filter(item => item.kind === "place").length} localidades, ${list.filter(item => item.kind !== "place").length} de agua y lugares)`);
