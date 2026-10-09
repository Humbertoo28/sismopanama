const API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const REGION = { minlatitude: 6, maxlatitude: 10.7, minlongitude: -83.8, maxlongitude: -77.0 };
const panamaDate = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric" });
const panamaDateTime = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const panamaClock = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit", hour12: true });
const $ = (id) => document.getElementById(id);

let days = 30;
let minMagnitude = 0;
let allEvents = [];
let map;
let markerLayer;
let markerById = new Map();
let currentRequest = 0;

function setText(id, value) { $(id).textContent = value; }
function magnitude(event) { return Number.isFinite(event.properties.mag) ? event.properties.mag : null; }
function magnitudeText(event) { const n = magnitude(event); return n === null ? "—" : n.toFixed(1); }
function eventDate(event) { return new Date(event.properties.time); }
function getPlace(event) { return event.properties.place || "Ubicación no especificada"; }
function getDepth(event) { const depth = event.geometry?.coordinates?.[2]; return Number.isFinite(depth) ? `${Math.round(depth)} km` : "No disponible"; }
function getCoords(event) { const [lng, lat] = event.geometry?.coordinates || []; return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null; }

function elapsed(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return ["Ahora", "mismo instante"];
  if (minutes < 60) return [`${minutes}`, minutes === 1 ? "minuto" : "minutos"];
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return [`${hours}`, hours === 1 ? "hora" : "horas"];
  const d = Math.floor(hours / 24);
  return [`${d}`, d === 1 ? "día" : "días"];
}

function updateClock() {
  setText("local-time", `Hora de Panamá · ${panamaClock.format(new Date())}`);
}

function setStatus(kind, title, detail) {
  const strip = document.querySelector(".status-strip");
  strip.classList.toggle("error", kind === "error");
  setText("data-status", title);
  setText("status-detail", detail);
}

function initMap() {
  if (typeof L === "undefined") {
    $("map-fallback").hidden = false;
    return;
  }
  map = L.map("leaflet-map", { scrollWheelZoom: false, zoomControl: false }).setView([8.46, -80.4], window.innerWidth < 760 ? 6 : 7);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function renderMap(events) {
  if (!map) return;
  markerLayer.clearLayers();
  markerById.clear();
  for (const event of events) {
    const coords = getCoords(event);
    if (!coords) continue;
    const mag = magnitude(event) || 0;
    const size = Math.max(12, Math.min(34, 11 + mag * 3.4));
    const icon = L.divIcon({
      className: "",
      html: `<span class="quake-marker${mag >= 5 ? " high" : ""}" style="width:${size}px;height:${size}px"></span>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
    const marker = L.marker(coords, { icon, title: `Sismo M ${magnitudeText(event)}: ${getPlace(event)}` }).addTo(markerLayer);
    const popup = document.createElement("div");
    const title = document.createElement("div");
    title.className = "popup-title";
    title.textContent = `M ${magnitudeText(event)} · ${getPlace(event)}`;
    const meta = document.createElement("div");
    meta.className = "popup-meta";
    meta.textContent = `${panamaDateTime.format(eventDate(event))} · ${getDepth(event)} de profundidad`;
    popup.append(title, meta);
    marker.bindPopup(popup);
    marker.on("click", () => renderFeatured(event));
    markerById.set(event.id, marker);
  }
}

function renderFeatured(event) {
  if (!event) {
    setText("featured-magnitude", "—");
    setText("featured-place", "No hay eventos para los filtros seleccionados.");
    setText("featured-date", "—");
    setText("featured-depth", "—");
    $("featured-link").href = "https://earthquake.usgs.gov/earthquakes/map/";
    return;
  }
  setText("featured-magnitude", magnitudeText(event));
  setText("featured-place", getPlace(event));
  setText("featured-date", panamaDateTime.format(eventDate(event)));
  setText("featured-depth", getDepth(event));
  $("featured-link").href = event.properties.url?.startsWith("https://earthquake.usgs.gov/") ? event.properties.url : "https://earthquake.usgs.gov/earthquakes/map/";
}

function makeEventRow(event) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "event-row";
  const mag = magnitude(event) || 0;
  const badge = document.createElement("span");
  badge.className = `magnitude-badge${mag >= 5 ? " high" : mag < 3 ? " low" : ""}`;
  badge.textContent = magnitudeText(event);
  const info = document.createElement("span");
  info.className = "event-text";
  const place = document.createElement("strong");
  place.textContent = getPlace(event);
  const depth = document.createElement("small");
  depth.textContent = `${getDepth(event)} de profundidad`;
  info.append(place, depth);
  const time = document.createElement("span");
  time.className = "event-time";
  const hour = document.createElement("strong");
  hour.textContent = panamaClock.format(eventDate(event));
  const date = document.createElement("small");
  date.textContent = panamaDate.format(eventDate(event));
  time.append(hour, date);
  button.append(badge, info, time);
  button.addEventListener("click", () => {
    renderFeatured(event);
    const marker = markerById.get(event.id);
    if (marker && map) {
      document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "start" });
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 9), { animate: true });
      marker.openPopup();
    } else if (event.properties.url) {
      window.open(event.properties.url, "_blank", "noopener,noreferrer");
    }
  });
  return button;
}

function render() {
  const events = allEvents.filter(event => magnitude(event) === null ? minMagnitude === 0 : magnitude(event) >= minMagnitude);
  setText("metric-count", events.length.toLocaleString("es-PA"));
  setText("metric-count-foot", `${days === 1 ? "Últimas 24 horas" : `Últimos ${days} días`} · Panamá y alrededores`);
  const strongest = events.reduce((best, event) => !best || (magnitude(event) || -10) > (magnitude(best) || -10) ? event : best, null);
  setText("metric-max", strongest ? magnitudeText(strongest) : "—");
  setText("metric-max-foot", strongest ? getPlace(strongest) : "Sin eventos disponibles");
  if (events.length) {
    const [value, unit] = elapsed(eventDate(events[0]).getTime());
    setText("metric-recent", value);
    setText("metric-recent-unit", unit);
    setText("metric-recent-foot", panamaDateTime.format(eventDate(events[0])));
  } else {
    setText("metric-recent", "—");
    setText("metric-recent-unit", "");
    setText("metric-recent-foot", "Sin eventos disponibles");
  }
  setText("results-count", `${events.length} ${events.length === 1 ? "evento" : "eventos"}`);
  const list = $("events-list");
  list.replaceChildren();
  if (events.length) {
    const fragment = document.createDocumentFragment();
    for (const event of events) fragment.append(makeEventRow(event));
    list.append(fragment);
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay sismos reportados para este período y magnitud. Prueba otro filtro.";
    list.append(empty);
  }
  renderFeatured(events[0]);
  renderMap(events);
}

async function loadEvents() {
  const request = ++currentRequest;
  const refresh = $("refresh-button");
  refresh.disabled = true;
  refresh.classList.add("loading");
  setStatus("loading", "Consultando sismos recientes…", "Fuente: USGS Earthquake Catalog");
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const params = new URLSearchParams({ format: "geojson", starttime: start, orderby: "time", limit: "2000", ...REGION });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let response;
    try { response = await fetch(`${API_URL}?${params}`, { signal: controller.signal, cache: "no-store" }); }
    finally { clearTimeout(timeout); }
    if (!response.ok && response.status !== 204) throw new Error(`USGS HTTP ${response.status}`);
    const payload = response.status === 204 ? { features: [] } : await response.json();
    if (!Array.isArray(payload.features)) throw new Error("Respuesta de datos inválida");
    if (request !== currentRequest) return;
    allEvents = payload.features.filter(event => Number.isFinite(event.properties?.time) && Array.isArray(event.geometry?.coordinates));
    render();
    setStatus("ready", "Datos sísmicos actualizados", `${allEvents.length} ${allEvents.length === 1 ? "evento reportado" : "eventos reportados"} en la región consultada`);
    setText("last-update", `Última consulta: ${panamaClock.format(new Date())}`);
  } catch (error) {
    if (request !== currentRequest) return;
    setStatus("error", "No se pudo consultar el catálogo", "Revisa tu conexión y pulsa «Actualizar datos» para intentar de nuevo.");
    if (!allEvents.length) {
      setText("metric-count", "—");
      setText("metric-max", "—");
      setText("metric-recent", "—");
      $("events-list").innerHTML = '<div class="empty-state">Los datos no están disponibles en este momento. Inténtalo de nuevo más tarde.</div>';
      setText("results-count", "Sin conexión");
      renderFeatured(null);
    }
    console.error("Error al consultar el catálogo sísmico:", error);
  } finally {
    if (request === currentRequest) {
      refresh.disabled = false;
      refresh.classList.remove("loading");
    }
  }
}

document.querySelectorAll("[data-days]").forEach(button => button.addEventListener("click", () => {
  days = Number(button.dataset.days);
  document.querySelectorAll("[data-days]").forEach(other => {
    const selected = other === button;
    other.classList.toggle("selected", selected);
    other.setAttribute("aria-pressed", String(selected));
  });
  loadEvents();
}));
$("magnitude-select").addEventListener("change", event => { minMagnitude = Number(event.target.value); render(); });
$("refresh-button").addEventListener("click", loadEvents);
setText("year", new Date().getFullYear());
updateClock();
setInterval(updateClock, 30000);
initMap();
loadEvents();
setInterval(() => { if (!document.hidden) loadEvents(); }, 300000);
