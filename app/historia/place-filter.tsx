"use client";

import { useCallback, useMemo, useState } from "react";
import type { PlaceIndex } from "./place-index";
import "./place-filter.css";

// El filtro por provincia y ciudad de la historia sísmica (lo usan el explorador de los 94 sismos y el mapa de los 12 más grandes).
// Las opciones salen de los propios sismos, con cuántos hay en cada una, y la ciudad depende de la provincia elegida, como en el
// filtro del mapa en vivo.
type Option = { id: string; name: string; count: number };

export function usePlaceFilter(ids: string[], index: PlaceIndex) {
  const [province, setProvince] = useState("all");
  const [city, setCity] = useState("all");

  // ¿Este sismo pasa con esa provincia y esa ciudad? (con "all" pasan todos)
  const test = useCallback((p: string, c: string, id: string) => {
    const entry = index.quakes[id];
    return (p === "all" || entry?.[0] === p) && (c === "all" || entry?.[1] === c);
  }, [index]);
  const matches = useCallback((id: string) => test(province, city, id), [test, province, city]);

  const provinceOptions = useMemo<Option[]>(() => {
    const counts = new Map<string, number>();
    for (const id of ids) {
      const entry = index.quakes[id];
      if (entry) counts.set(entry[0], (counts.get(entry[0]) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ id, name: index.provinces[id] ?? id, count })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [ids, index]);
  const cityOptions = useMemo<Option[]>(() => {
    const counts = new Map<string, number>();
    for (const id of ids) {
      const entry = index.quakes[id];
      if (entry && entry[1] && (province === "all" || entry[0] === province)) counts.set(entry[1], (counts.get(entry[1]) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ id, name: index.cities[id] ?? id, count })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [ids, index, province]);

  const change = (nextProvince: string, nextCity: string) => {
    setProvince(nextProvince);
    setCity(nextCity);
  };
  const filtered = province !== "all" || city !== "all";
  return {
    province, city, filtered, matches, test, provinceOptions, cityOptions, total: ids.length,
    // Texto corto del lugar elegido, para decirlo junto a los conteos: «Chiriquí · Limones».
    label: filtered ? [province !== "all" ? index.provinces[province] ?? province : null, city !== "all" ? index.cities[city] ?? city : null].filter(Boolean).join(" · ") : "",
    key: filtered ? `${province}|${city}` : "",
    selectProvince: (value: string) => change(value, "all"),
    selectCity: (value: string) => change(province, value),
    clear: () => change("all", "all"),
  };
}
export type PlaceFilter = ReturnType<typeof usePlaceFilter>;

export function PlaceFilterControls({ filter }: { filter: PlaceFilter }) {
  return (
    <div className="hx-group" role="group" aria-label="Filtros por lugar">
      <label className="pf-field">
        <span className="hx-label">Provincia</span>
        <select aria-label="Filtrar por provincia o comarca" value={filter.province} onChange={event => filter.selectProvince(event.target.value)}>
          <option value="all">Todas · {filter.total}</option>
          {filter.provinceOptions.map(option => <option key={option.id} value={option.id}>{option.name} · {option.count}</option>)}
        </select>
      </label>
      <label className="pf-field">
        <span className="hx-label">Ciudad</span>
        <select aria-label="Filtrar por ciudad o localidad" value={filter.city} onChange={event => filter.selectCity(event.target.value)}>
          <option value="all">Todas</option>
          {filter.cityOptions.map(option => <option key={option.id} value={option.id}>{option.name} · {option.count}</option>)}
        </select>
      </label>
      {filter.filtered && <button type="button" className="hx-btn" onClick={filter.clear}>Quitar filtros</button>}
    </div>
  );
}

// La nota que explica cómo se asigna cada lugar (la misma en el explorador y en el mapa de los 12).
export function PlaceFilterNote() {
  return (
    <details className="pf-how">
      <summary>Cómo se asignan la provincia y la ciudad</summary>
      <p>Son las mismas reglas del filtro del mapa en vivo. La provincia o comarca es la del epicentro publicado; si cae en el mar, la de la ciudad que cita el título del USGS (o la costa más cercana). La ciudad es la que cita el título del USGS si está en la lista de GeoNames (CC BY 4.0); si no, la localidad más cercana de su provincia. Los epicentros antiguos son reconstrucciones del USGS: pueden tener varios kilómetros de error.</p>
    </details>
  );
}
