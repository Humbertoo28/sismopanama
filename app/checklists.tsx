"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CHECKLISTS } from "../lib/safety-guide";

const STORAGE_KEY = "sismo-panama:checklists:v1";

// El progreso vive en localStorage; si no está disponible (modo privado, datos bloqueados),
// la lista funciona igual con la copia en memoria, solo que no se recuerda al recargar.
let stored: string | null = null;
const listeners = new Set<() => void>();

function readStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    stored = readStorage();
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
const getSnapshot = () => (stored ??= readStorage());
const getServerSnapshot = () => "";
function writeStorage(value: string) {
  stored = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ver nota arriba: se conserva solo en memoria.
  }
  listeners.forEach(listener => listener());
}

function parseStored(raw: string): Record<string, string[]> {
  try {
    const parsed = JSON.parse(raw || "{}");
    const result: Record<string, string[]> = {};
    for (const list of CHECKLISTS) {
      const saved = parsed?.[list.id];
      if (Array.isArray(saved)) result[list.id] = list.items.map(item => item.id).filter(id => saved.includes(id));
    }
    return result;
  } catch {
    return {};
  }
}

export default function Checklists() {
  const [listId, setListId] = useState(CHECKLISTS[0].id);
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const checked = useMemo(() => parseStored(raw), [raw]);

  const list = CHECKLISTS.find(item => item.id === listId) ?? CHECKLISTS[0];
  const done = checked[list.id] ?? [];

  const update = (ids: string[]) => writeStorage(JSON.stringify({ ...checked, [list.id]: ids }));
  const toggle = (id: string) => update(done.includes(id) ? done.filter(item => item !== id) : [...done, id]);

  return (
    <div className="check-card">
      <div className="card-heading"><div><span className="section-kicker">LISTA RÁPIDA</span><h2 id="checklist-title">Qué revisar</h2></div></div>
      <div className="segmented check-tabs" role="group" aria-label="Elegir lista">
        {CHECKLISTS.map(item => (
          <button key={item.id} type="button" className={item.id === list.id ? "selected" : ""} aria-pressed={item.id === list.id} onClick={() => setListId(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="check-progress">
        <div className="check-bar" role="progressbar" aria-label={`Progreso: ${list.label}`} aria-valuemin={0} aria-valuemax={list.items.length} aria-valuenow={done.length}><i style={{ width: `${(done.length / list.items.length) * 100}%` }} /></div>
        <span aria-live="polite">{done.length} de {list.items.length}{done.length === list.items.length ? " · ¡Listo!" : ""}</span>
      </div>
      <ul className="check-list">
        {list.items.map(item => (
          <li key={item.id}>
            <label className={done.includes(item.id) ? "checked" : ""}>
              <input type="checkbox" checked={done.includes(item.id)} onChange={() => toggle(item.id)} />
              <span className="check-box" aria-hidden="true" />
              <span className="check-text"><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="check-foot">
        <span>{list.note ?? "Progreso guardado en este equipo."}</span>
        {done.length > 0 && <button type="button" onClick={() => update([])}>Reiniciar</button>}
      </div>
    </div>
  );
}
