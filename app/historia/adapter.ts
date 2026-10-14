import type { Earthquake } from "../../lib/earthquakes";
import { placeEs, type HistoricQuake } from "../../lib/history";

// Un sismo del historial con la forma de los del catálogo en vivo (la escena 3D del sitio la espera así).
export const toEarthquake = (quake: HistoricQuake): Earthquake => ({
  id: quake.id,
  properties: { mag: quake.mag, place: placeEs(quake.place), time: quake.time, url: quake.url, source: "usgs", status: "reviewed", magType: quake.magType },
  geometry: { coordinates: quake.depth === null ? [quake.lng, quake.lat] : [quake.lng, quake.lat, quake.depth] },
});
