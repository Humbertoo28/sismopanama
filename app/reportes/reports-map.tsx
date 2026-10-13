"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet se carga como script global (public/leaflet.js), sin tipos. */
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { INTENSITIES, typicalIntensity, type PlaceSummary } from "../../lib/felt-reports";

// Dónde lo sintieron: un círculo por localidad con reportes, del tamaño según cuántas personas respondieron y del color de la
// fuerza que más se repitió (gris si allí nadie lo sintió). La estrella es el epicentro.
const LEVEL_COLORS = ["#8fb7ef", "#f2bd38", "#ef7b2d", "#b8102b"];
const BASE = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";

export default function ReportsMap({ places, epicenter }: { places: PlaceSummary[]; epicenter: { lat: number; lng: number } }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!(window as any).L);

  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !node.current || mapRef.current) return;
    const map = L.map(node.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, minZoom: 5 });
    L.tileLayer(BASE, { maxZoom: 13, attribution: "Mapa © Esri" }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const bounds = L.latLngBounds([[epicenter.lat, epicenter.lng]]);
    // Los grandes primero, debajo; así los pequeños quedan a la vista.
    for (const place of [...places].sort((a, b) => b.yes + b.no - (a.yes + a.no))) {
      const level = typicalIntensity(place.byIntensity);
      const count = place.yes + place.no;
      const color = level ? LEVEL_COLORS[level.value - 1] : "#9aa5b4";
      const text = `${place.label}: ${place.yes} lo ${place.yes === 1 ? "sintió" : "sintieron"}${level ? ` (sobre todo ${level.name.toLowerCase()})` : ""}, ${place.no} no · a ${place.km} km del epicentro`;
      L.circleMarker([place.lat, place.lng], {
        radius: Math.min(26, 6 + 4 * Math.sqrt(count)), color: "#ffffff", weight: 1.5, fillColor: color, fillOpacity: 0.85,
      }).bindTooltip(text, { direction: "top" }).addTo(layer);
      bounds.extend([place.lat, place.lng]);
    }
    L.marker([epicenter.lat, epicenter.lng], {
      keyboard: false,
      icon: L.divIcon({ className: "", html: '<span class="reports-epicenter" aria-hidden="true">★</span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
    }).bindTooltip("Epicentro", { direction: "top" }).addTo(layer);
    map.fitBounds(bounds.pad(0.25), { maxZoom: 9 });
  }, [places, epicenter, ready]);

  return (
    <>
      <Script src="/leaflet.js" strategy="afterInteractive" onLoad={() => setReady(true)} onReady={() => setReady(true)} />
      <div ref={node} className="reports-map" role="img" aria-label="Mapa de las localidades desde donde se reportó el sismo. La tabla de abajo tiene los mismos datos." />
      <ul className="reports-map-legend" aria-hidden="true">
        {INTENSITIES.map((item, index) => <li key={item.value}><i style={{ background: LEVEL_COLORS[index] }} />{item.name}</li>)}
        <li><i style={{ background: "#9aa5b4" }} />No lo sintieron</li>
        <li><span className="reports-epicenter small">★</span>Epicentro</li>
      </ul>
    </>
  );
}
