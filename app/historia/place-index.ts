// Dónde cae cada sismo de la historia, para filtrar por provincia y ciudad. Se calcula en el servidor (lib/province-of.ts y
// lib/place-of.ts, las mismas reglas del filtro del mapa en vivo) y al navegador solo llegan los identificadores y los nombres:
//   quakes[id] = [provincia o comarca, ciudad o localidad ("" si no hay)]; la provincia es el id de lib/provinces.ts o "mar" (mar adentro).
export type PlaceIndex = {
  quakes: Record<string, [province: string, city: string]>;
  provinces: Record<string, string>;
  cities: Record<string, string>;
};

// El mismo índice reducido a unos pocos sismos (el mapa de los 12 más grandes no necesita los 94).
export function subsetIndex(index: PlaceIndex, ids: string[]): PlaceIndex {
  const out: PlaceIndex = { quakes: {}, provinces: {}, cities: {} };
  for (const id of ids) {
    const entry = index.quakes[id];
    if (!entry) continue;
    out.quakes[id] = entry;
    out.provinces[entry[0]] = index.provinces[entry[0]];
    if (entry[1]) out.cities[entry[1]] = index.cities[entry[1]];
  }
  return out;
}
