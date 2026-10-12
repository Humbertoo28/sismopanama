// Límites de las placas tectónicas alrededor de Panamá. Fuente: modelo PB2002 de Peter Bird (2003), «An updated digital
// model of plate boundaries», Geochemistry, Geophysics, Geosystems 4(3):1027, doi:10.1029/2001GC000252, en la
// conversión a GeoJSON de Hugo Ahlenius (Nordpil), licencia Open Data Commons Attribution (ODC-By 1.0). No es un
// producto de ninguna agencia de gobierno. Son límites aproximados de un modelo global: en Panamá las zonas de
// contacto son anchas y difusas, y su posición real puede diferir de la línea en varias decenas de kilómetros.
// Cada polilínea es una lista de [longitud, latitud], simplificada a ~3 km. `kind` es la clase del límite en el modelo.
export type BoundaryKind = "subduction" | "transform" | "divergent" | "convergent";
export type PlateBoundary = { a: string; b: string; kind: BoundaryKind; points: [number, number][] };

export const PLATE_NAMES: Record<string, string> = {
  CO: "Placa del Coco",
  NZ: "Placa de Nazca",
  CA: "Placa del Caribe",
  PM: "Microplaca de Panamá",
  ND: "Bloque Andes del Norte",
  SA: "Placa Sudamericana",
};

// Nombres cortos para rotular un límite entre dos placas («Nazca | Panamá»).
export const PLATE_SHORT: Record<string, string> = {
  CO: "Coco", NZ: "Nazca", CA: "Caribe", PM: "Panamá", ND: "Andes del Norte", SA: "Sudamérica",
};

// Qué es cada tipo de límite, en palabras sencillas.
export const KIND_INFO: Record<BoundaryKind, { name: string; meaning: string; color: string }> = {
  subduction: { name: "Subducción", meaning: "una placa se hunde bajo otra", color: "#ff5a5f" },
  transform: { name: "Falla transformante", meaning: "las placas se deslizan de lado", color: "#ffd23f" },
  divergent: { name: "Extensión", meaning: "las placas se separan", color: "#3ddcff" },
  convergent: { name: "Convergencia", meaning: "las placas chocan", color: "#c77dff" },
};

export const PLATE_BOUNDARIES: PlateBoundary[] = [
  { a: "CA", b: "ND", kind: "subduction", points: [[-76.68, 8.73], [-76.7, 9.78], [-76.59, 10.11], [-76.46, 10.33], [-76.06, 10.77], [-75.91, 11.09], [-75.6, 11.42], [-75.15, 11.75], [-74.8, 11.91]] },
  { a: "CO", b: "NZ", kind: "transform", points: [[-82.88, 3.6], [-82.88, 7.37]] },
  { a: "CO", b: "PM", kind: "subduction", points: [[-82.88, 7.37], [-83.23, 7.85], [-83.84, 8.18], [-84.15, 8.47], [-84.4, 8.63], [-85.63, 9.21], [-85.9, 9.41], [-86.44, 9.92], [-86.65, 10.23]] },
  { a: "ND", b: "NZ", kind: "subduction", points: [[-78.65, 7.34], [-78.76, 7.12], [-78.75, 7.03], [-78.58, 6.92], [-78.34, 6.56], [-78.19, 6.46], [-78.09, 6.12], [-78.01, 6.0]] },
  { a: "NZ", b: "PM", kind: "transform", points: [[-78.65, 7.34], [-79.26, 7.3], [-80.09, 7.1], [-80.25, 7.13]] },
  { a: "NZ", b: "PM", kind: "convergent", points: [[-80.25, 7.13], [-80.69, 7.42]] },
  { a: "NZ", b: "PM", kind: "divergent", points: [[-80.69, 7.42], [-81.04, 7.22]] },
  { a: "NZ", b: "PM", kind: "transform", points: [[-81.04, 7.22], [-81.49, 7.05], [-81.74, 7.06]] },
  { a: "NZ", b: "PM", kind: "divergent", points: [[-81.74, 7.06], [-81.94, 6.95]] },
  { a: "NZ", b: "PM", kind: "transform", points: [[-81.94, 6.95], [-82.09, 6.97]] },
  { a: "NZ", b: "PM", kind: "convergent", points: [[-82.09, 6.97], [-82.23, 7.07], [-82.34, 7.25], [-82.49, 7.3]] },
  { a: "NZ", b: "PM", kind: "transform", points: [[-82.49, 7.3], [-82.75, 7.28]] },
  { a: "NZ", b: "PM", kind: "convergent", points: [[-82.75, 7.28], [-82.88, 7.37]] },
  { a: "NZ", b: "ND", kind: "subduction", points: [[-78.66, 3.39], [-78.33, 4.09], [-77.91, 5.49], [-78.01, 6.0]] },
  { a: "PM", b: "CA", kind: "transform", points: [[-76.68, 8.73], [-76.77, 9.06]] },
  { a: "PM", b: "CA", kind: "convergent", points: [[-76.77, 9.06], [-76.92, 9.38], [-77.27, 9.88], [-77.65, 10.25], [-78.23, 10.62], [-78.76, 10.65], [-78.98, 10.58], [-79.23, 10.41], [-79.48, 10.43], [-80.4, 10.26], [-81.08, 9.94], [-81.31, 9.78], [-81.65, 9.44], [-82.09, 9.44], [-82.3, 9.5], [-83.02, 9.87], [-83.2, 10.05], [-83.48, 10.22], [-84.07, 10.45], [-84.76, 10.6], [-85.08, 10.65], [-85.44, 10.63], [-85.98, 10.49], [-86.65, 10.23]] },
  { a: "PM", b: "ND", kind: "transform", points: [[-78.65, 7.34], [-78.22, 7.51], [-77.71, 7.83]] },
  { a: "PM", b: "ND", kind: "convergent", points: [[-77.71, 7.83], [-77.53, 8.01]] },
  { a: "PM", b: "ND", kind: "transform", points: [[-77.53, 8.01], [-77.15, 8.19]] },
  { a: "PM", b: "ND", kind: "convergent", points: [[-77.15, 8.19], [-76.68, 8.73]] },
];

// Dónde escribir el nombre de cada placa (el centro de la placa dentro de la zona del mapa).
export const PLATE_LABELS: { code: string; lat: number; lng: number }[] = [
  { code: "NZ", lat: 6.36, lng: -80.53 },
  { code: "CA", lat: 10.01, lng: -80.65 },
  { code: "CO", lat: 6.76, lng: -83.49 },
  { code: "ND", lat: 7.0, lng: -77.36 },
  { code: "PM", lat: 8.75, lng: -80.4 },
];

export const PLATES_SOURCE = "Placas: modelo PB2002, P. Bird (2003), vía H. Ahlenius/Nordpil (ODC-By)";

// Límite de placas más cercano a un punto (distancia a las líneas del mapa, en km, con la aproximación plana de siempre).
export function nearestBoundary(lat: number, lng: number) {
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  let best: { boundary: PlateBoundary; km: number } | null = null;
  for (const boundary of PLATE_BOUNDARIES) {
    for (let i = 0; i < boundary.points.length - 1; i++) {
      const [ax, ay] = boundary.points[i];
      const [bx, by] = boundary.points[i + 1];
      const [dx, dy] = [(bx - ax) * kx, (by - ay) * ky];
      const [px, py] = [(lng - ax) * kx, (lat - ay) * ky];
      const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
      const km = Math.hypot(px - t * dx, py - t * dy);
      if (!best || km < best.km) best = { boundary, km };
    }
  }
  return best;
}
