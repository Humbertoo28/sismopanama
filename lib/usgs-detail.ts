import { MAINSHOCK_ID } from "./earthquakes";
import { PANAMA_MAP_BOUNDS } from "./panama";
import { queryUsgs } from "./usgs";

// Datos que el USGS publica del sismo principal además de su ubicación y magnitud. Todo viene tal cual de sus
// productos; nada se calcula ni se estima aquí, solo se recorta lo que la página dibuja.

export type Plane = { strike: number; dip: number; rake: number };

export type Mechanism = {
  // Tensor de momento (N·m) en coordenadas arriba–sur–este, como lo publica el USGS.
  tensor: { rr: number; tt: number; pp: number; rt: number; rp: number; tp: number };
  planes: [Plane, Plane];
  magnitude: number;
  magType: string;
  reviewed: boolean;
};

// Una celda de la falla: cuatro esquinas [lng, lat, profundidad km] y cuánto se deslizó (m).
// `t`: segundo en que esa celda empieza a deslizarse (contado desde el inicio de la ruptura) y `rise`: cuántos segundos tarda
// en llegar a su deslizamiento final. Ambos son salidas del modelo del USGS.
export type Subfault = { slip: number; ring: [number, number, number][]; t: number | null; rise: number | null };

export type Fault = {
  subfaults: Subfault[];
  maxSlipM: number;
  // Duración de la ruptura del modelo (segundos), si trae los tiempos de cada celda.
  durationS: number | null;
  lengthKm: number | null;
  widthKm: number | null;
  strike: number | null;
  dip: number | null;
  reviewed: boolean;
};

// Cuadro de 10 km con reportes de «¿Lo sentiste?»: [sur, oeste, norte, este, intensidad, respuestas].
export type FeltCell = [number, number, number, number, number, number];

export type Felt = { responses: number; maxIntensity: number | null; cells: FeltCell[] };

// Curva de igual intensidad del ShakeMap del USGS (estimada con un modelo y datos de estaciones). Cada línea es
// una lista de [lng, lat].
export type Contour = { value: number; lines: [number, number][][] };

export type MainshockDetail = {
  id: string;
  url: string;
  mechanism: Mechanism | null;
  fault: Fault | null;
  felt: Felt | null;
  shaking: Contour[] | null;
  fetchedAt: string;
};

type Content = { url?: string };
type Product = { properties: Record<string, string>; contents: Record<string, Content> };
type Detail = { properties: { url?: string; products?: Record<string, Product[]> } };

const num = (value: string | undefined) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : null;
};

const round = (value: number, digits: number) => Number(value.toFixed(digits));

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`USGS respondió ${response.status}`);
  return response.json();
}

function mechanismOf(product: Product | undefined): Mechanism | null {
  if (!product) return null;
  const p = product.properties;
  const tensor = { rr: num(p["tensor-mrr"]), tt: num(p["tensor-mtt"]), pp: num(p["tensor-mpp"]), rt: num(p["tensor-mrt"]), rp: num(p["tensor-mrp"]), tp: num(p["tensor-mtp"]) };
  const plane = (n: 1 | 2) => ({ strike: num(p[`nodal-plane-${n}-strike`]), dip: num(p[`nodal-plane-${n}-dip`]), rake: num(p[`nodal-plane-${n}-rake`]) });
  const [a, b] = [plane(1), plane(2)];
  const magnitude = num(p["derived-magnitude"]);
  if (Object.values(tensor).some(v => v === null) || [a, b].some(pl => Object.values(pl).some(v => v === null)) || magnitude === null) return null;
  return {
    tensor: tensor as Mechanism["tensor"],
    planes: [a as Plane, b as Plane],
    magnitude,
    magType: p["derived-magnitude-type"] ?? "",
    reviewed: p["review-status"] === "reviewed",
  };
}

type Ffm = { features?: { geometry?: { type?: string; coordinates?: number[][][] }; properties?: { slip?: number; trup?: number; rise?: number } }[] };

async function faultOf(product: Product | undefined): Promise<Fault | null> {
  const url = product?.contents["FFM.geojson"]?.url;
  if (!product || !url) return null;
  const ffm = (await getJson(url)) as Ffm;
  const subfaults: Subfault[] = [];
  for (const feature of ffm.features ?? []) {
    const ring = feature.geometry?.coordinates?.[0];
    const slip = feature.properties?.slip;
    if (feature.geometry?.type !== "Polygon" || !ring || typeof slip !== "number") continue;
    // El archivo repite la primera esquina al final y da la profundidad en metros.
    const corners = ring.slice(0, 4).map(([lng, lat, depthM]) => [round(lng, 4), round(lat, 4), round((depthM ?? 0) / 1000, 1)] as [number, number, number]);
    const { trup, rise } = feature.properties ?? {};
    if (corners.length === 4 && corners.every(c => c.every(Number.isFinite))) {
      subfaults.push({ slip: round(slip, 2), ring: corners, t: typeof trup === "number" ? round(trup, 1) : null, rise: typeof rise === "number" ? round(rise, 1) : null });
    }
  }
  if (!subfaults.length) return null;
  const p = product.properties;
  return {
    subfaults,
    maxSlipM: Math.max(...subfaults.map(s => s.slip)),
    durationS: subfaults.every(s => s.t !== null && s.rise !== null) ? Math.max(...subfaults.map(s => (s.t ?? 0) + (s.rise ?? 0))) : null,
    lengthKm: num(p["model-length"]),
    widthKm: num(p["model-width"]),
    strike: num(p["model-strike"]),
    dip: num(p["model-dip"]),
    reviewed: p["review-status"] === "reviewed",
  };
}

type Dyfi = { features?: { geometry?: { type?: string; coordinates?: number[][][] }; properties?: { cdi?: number; nresp?: number } }[] };

async function feltOf(product: Product | undefined): Promise<Felt | null> {
  const url = product?.contents["dyfi_geo_10km.geojson"]?.url;
  if (!product || !url) return null;
  const dyfi = (await getJson(url)) as Dyfi;
  const [[south, west], [north, east]] = PANAMA_MAP_BOUNDS;
  const cells: FeltCell[] = [];
  for (const feature of dyfi.features ?? []) {
    const ring = feature.geometry?.coordinates?.[0];
    const { cdi, nresp } = feature.properties ?? {};
    if (!ring || typeof cdi !== "number" || typeof nresp !== "number") continue;
    const lats = ring.map(c => c[1]);
    const lngs = ring.map(c => c[0]);
    const cell: FeltCell = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs), cdi, nresp];
    // Solo los cuadros que caen dentro del mapa; hay respuestas de lugares lejanos que no se ven.
    if (cell[2] < south || cell[0] > north || cell[3] < west || cell[1] > east) continue;
    cells.push([round(cell[0], 4), round(cell[1], 4), round(cell[2], 4), round(cell[3], 4), cdi, nresp]);
  }
  return { responses: num(product.properties["num-responses"]) ?? cells.reduce((sum, c) => sum + c[5], 0), maxIntensity: num(product.properties["maxmmi"]), cells };
}

type ContourFile = { features?: { geometry?: { type?: string; coordinates?: number[][][] }; properties?: { value?: number } }[] };

async function shakingOf(product: Product | undefined): Promise<Contour[] | null> {
  const url = product?.contents["download/cont_mmi.json"]?.url;
  if (!url) return null;
  const file = (await getJson(url)) as ContourFile;
  const contours: Contour[] = [];
  for (const feature of file.features ?? []) {
    const value = feature.properties?.value;
    const lines = feature.geometry?.coordinates;
    if (typeof value !== "number" || feature.geometry?.type !== "MultiLineString" || !lines) continue;
    contours.push({ value, lines: lines.map(line => line.map(([lng, lat]) => [round(lng, 3), round(lat, 3)] as [number, number])) });
  }
  return contours.length ? contours.sort((a, b) => a.value - b.value) : null;
}

export async function fetchMainshockDetail(): Promise<MainshockDetail> {
  const detail = (await queryUsgs({ eventid: MAINSHOCK_ID })) as Detail | null;
  const products = detail?.properties.products;
  if (!detail || !products) throw new Error("Respuesta inválida del catálogo");
  // La lista de cada producto viene con la versión preferida primero.
  const [mechanism, fault, felt, shaking] = await Promise.allSettled([
    Promise.resolve(mechanismOf(products["moment-tensor"]?.[0])),
    faultOf(products["finite-fault"]?.[0]),
    feltOf(products["dyfi"]?.[0]),
    shakingOf(products["shakemap"]?.[0]),
  ]);
  const value = <T,>(result: PromiseSettledResult<T | null>) => (result.status === "fulfilled" ? result.value : null);
  [mechanism, fault, felt, shaking].forEach(result => result.status === "rejected" && console.error("USGS producto no disponible:", result.reason));
  return {
    id: MAINSHOCK_ID,
    url: detail.properties.url ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${MAINSHOCK_ID}`,
    mechanism: value(mechanism),
    fault: value(fault),
    felt: value(felt),
    shaking: value(shaking),
    fetchedAt: new Date().toISOString(),
  };
}
