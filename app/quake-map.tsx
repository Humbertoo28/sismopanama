"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { isAftershock, type Earthquake } from "../lib/earthquakes";

type Props = {
  events: Earthquake[];
  mainshock: Earthquake | null;
  focus: { id: string } | null;
  onSelect: (id: string) => void;
};

const dateTime = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});

export default function QuakeMap({ events, mainshock, focus, onSelect }: Props) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const focusedRef = useRef<Props["focus"]>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ready || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map("leaflet-map", { scrollWheelZoom: false, zoomControl: false })
      .setView([8.46, -80.4], window.innerWidth < 760 ? 6 : 7);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, [ready]);

  useEffect(() => {
    const L = (window as any).L;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const event of events) {
      const [lng, lat, depth] = event.geometry.coordinates;
      const mag = event.properties.mag;
      const isMain = event.id === mainshock?.id;
      const size = isMain ? 40 : Math.max(12, Math.min(34, 11 + (mag ?? 0) * 3.4));
      const kind = isMain ? " main" : mainshock && isAftershock(event, mainshock) ? " after" : "";
      const icon = L.divIcon({
        className: "",
        html: `<span class="quake-marker${(mag ?? 0) >= 5 ? " high" : ""}${kind}" style="width:${size}px;height:${size}px"></span>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: isMain ? 1000 : 0,
        title: `Sismo M ${mag === null ? "—" : mag.toFixed(1)}: ${event.properties.place || "Ubicación no especificada"}`,
      }).addTo(layer);
      const popup = document.createElement("div");
      const title = document.createElement("div");
      title.className = "popup-title";
      title.textContent = `M ${mag === null ? "—" : mag.toFixed(1)} · ${event.properties.place || "Ubicación no especificada"}`;
      const meta = document.createElement("div");
      meta.className = "popup-meta";
      meta.textContent = `${dateTime.format(new Date(event.properties.time))} · ${Number.isFinite(depth) ? `${Math.round(depth!)} km` : "Profundidad no disponible"}`;
      // appendChild y no append: los tipos de workers-types pisan Element.append.
      popup.appendChild(title);
      popup.appendChild(meta);
      marker.bindPopup(popup);
      marker.on("click", () => onSelectRef.current(event.id));
      markersRef.current.set(event.id, marker);
    }
  }, [events, mainshock, ready]);

  useEffect(() => {
    if (!focus || focusedRef.current === focus || !mapRef.current) return;
    const marker = markersRef.current.get(focus.id);
    if (!marker) return;
    focusedRef.current = focus;
    const map = mapRef.current;
    // Abrir el popup antes de que termine el desplazamiento animado lo cancela.
    map.once("moveend", () => markersRef.current.get(focus.id)?.openPopup());
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 9), { animate: true });
  }, [focus, events, ready]);

  return (
    <>
      <Script src="/leaflet.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div id="leaflet-map" role="img" aria-label="Mapa interactivo de sismos en Panamá y alrededores" />
      {!ready && <div className="map-fallback">Cargando mapa…</div>}
    </>
  );
}
