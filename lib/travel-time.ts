// Tiempo que tarda en llegar la primera onda P y la primera onda S a una distancia dada, calculado con el modelo de velocidades
// de referencia ak135 (IASPEI; Kennett, Engdahl y Buland, 1995) para la corteza y el tope del manto. Es el modelo estándar con el
// que las agencias internacionales calculan los tiempos de llegada al localizar sismos. Se traza el rayo de la onda directa y
// los de las ondas refractadas en las discontinuidades (Conrad y Moho) y vale la primera que llega. Ver scripts/check-travel-time.ts
// para la comparación con las llegadas reales que publica el USGS.

type Layer = { bottom: number; vp: number; vs: number };

// Profundidad del fondo de cada capa (km) y velocidades (km/s). La última es el manto, hacia abajo sin fin.
const MODEL: Layer[] = [
  { bottom: 20, vp: 5.8, vs: 3.46 },
  { bottom: 35, vp: 6.5, vs: 3.85 },
  { bottom: Infinity, vp: 8.04, vs: 4.48 },
];

export type Wave = "p" | "s";

// Prepara lo que no depende de la distancia (grosores, parámetros de rayo y tiempos verticales de las refractadas) para un foco a
// `depth` km, y devuelve la función que da el tiempo de la primera llegada a `x` km del epicentro.
function arrivalFrom(depth: number, wave: Wave): (x: number) => number {
  const speeds = MODEL.map(layer => (wave === "p" ? layer.vp : layer.vs));
  const tops = MODEL.map((_, index) => (index === 0 ? 0 : MODEL[index - 1].bottom));
  const source = MODEL.findIndex(layer => depth < layer.bottom);
  const slowness = (index: number, p: number) => Math.sqrt(Math.max(1 / speeds[index] ** 2 - p * p, 1e-12));
  const horizontal = (thickness: number[], p: number) => thickness.reduce((sum, h, index) => (h > 0 ? sum + (h * p) / slowness(index, p) : sum), 0);
  const vertical = (thickness: number[], p: number) => thickness.reduce((sum, h, index) => (h > 0 ? sum + h * slowness(index, p) : sum), 0);

  // Grosor de cada capa que recorre la onda al subir desde el foco hasta la superficie.
  const upward = MODEL.map((layer, index) => (index < source ? layer.bottom - tops[index] : index === source ? depth - tops[index] : 0));
  const hasUpward = upward.some(h => h > 0);
  const pMax = (1 / speeds[source]) * (1 - 1e-9);

  // Ondas refractadas en cada discontinuidad por debajo del foco: viajan por la capa de abajo a su velocidad.
  const heads: { p: number; critical: number; offset: number }[] = [];
  for (let below = source; below < MODEL.length - 1; below++) {
    const p = 1 / speeds[below + 1];
    const down = MODEL.map((layer, index) => (index === source ? Math.min(layer.bottom, MODEL[below].bottom) - depth : index > source && index <= below ? layer.bottom - tops[index] : 0));
    const up = MODEL.map((layer, index) => (index <= below ? layer.bottom - tops[index] : 0));
    heads.push({ p, critical: horizontal(down, p) + horizontal(up, p), offset: vertical(down, p) + vertical(up, p) });
  }

  return (x: number) => {
    // Onda directa: se busca el parámetro de rayo p cuya trayectoria ascendente llega a `x`.
    let best = Infinity;
    if (hasUpward) {
      let [low, high] = [0, pMax];
      for (let i = 0; i < 34; i++) {
        const mid = (low + high) / 2;
        if (horizontal(upward, mid) < x) low = mid;
        else high = mid;
      }
      const p = (low + high) / 2;
      best = p * x + vertical(upward, p);
    } else {
      best = x / speeds[source];
    }
    for (const head of heads) if (x >= head.critical) best = Math.min(best, x * head.p + head.offset);
    return best;
  };
}

// Tiempo de la primera llegada de la onda `wave` a `x` km del epicentro (sobre la superficie) para un foco a `depth` km.
export function firstArrival(x: number, depth: number, wave: Wave): number {
  return arrivalFrom(depth, wave)(x);
}

// Distancia sobre la superficie (km) a la que ya llegó el frente de la onda `wave` pasados `seconds` desde el origen.
export function frontRadiusKm(seconds: number, depth: number, wave: Wave): number {
  const arrival = arrivalFrom(depth, wave);
  if (seconds <= arrival(0)) return 0;
  let [low, high] = [0, 3000];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (arrival(mid) < seconds) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// Tabla de tiempos para consultar rápido (la vista 3D pide millones de combinaciones): se calcula una vez por tipo de onda y se
// interpola entre sus nodos (cada 2 km de distancia y cada 1 km de profundidad, hasta 1 000 km y 40 km).
const tables = new Map<Wave, { data: Float32Array; nx: number; nz: number }>();
const [TABLE_DX, TABLE_DZ, TABLE_MAX_X, TABLE_MAX_Z] = [2, 1, 1000, 40];

export function travelTime(wave: Wave) {
  let table = tables.get(wave);
  if (!table) {
    const [nx, nz] = [Math.floor(TABLE_MAX_X / TABLE_DX) + 1, Math.floor(TABLE_MAX_Z / TABLE_DZ) + 1];
    const data = new Float32Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) {
      const arrival = arrivalFrom(iz * TABLE_DZ, wave);
      for (let ix = 0; ix < nx; ix++) data[iz * nx + ix] = arrival(ix * TABLE_DX);
    }
    table = { data, nx, nz };
    tables.set(wave, table);
  }
  const { data, nx, nz } = table;
  return (x: number, depth: number) => {
    const [fx, fz] = [Math.min(nx - 1.001, Math.max(0, x / TABLE_DX)), Math.min(nz - 1.001, Math.max(0, depth / TABLE_DZ))];
    const [ix, iz] = [Math.floor(fx), Math.floor(fz)];
    const [tx, tz] = [fx - ix, fz - iz];
    const at = (jx: number, jz: number) => data[jz * nx + jx];
    return (at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx) * (1 - tz) + (at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx) * tz;
  };
}
