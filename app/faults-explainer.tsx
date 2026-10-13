import { MapPin } from "lucide-react";
import { ACTIVE_FAULTS, ACTIVE_FAULTS_SOURCE, type ActiveFault } from "../lib/active-faults";
import type { Earthquake } from "../lib/earthquakes";

// La falla de Pedro Miguel, explicada: qué es, qué se sabe de ella (Rockwell et al., 2010) y qué tiene que ver (o no) con el
// terremoto del 9 de octubre. Sin alarmismo: ninguna falla permite predecir cuándo habrá un sismo.

// Centro histórico de la ciudad de Panamá (Plaza de la Independencia).
const CITY = { lat: 8.9524, lng: -79.535 };

// Distancia (km) de un punto a la línea de una falla, con la aproximación plana de siempre (sobra a esta escala).
function kmToLine(lat: number, lng: number, points: [number, number][]) {
  const kx = Math.cos((lat * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const [dx, dy] = [(bx - ax) * kx, (by - ay) * ky];
    const [px, py] = [(lng - ax) * kx, (lat - ay) * ky];
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }
  return best;
}

const kmToFault = (lat: number, lng: number, fault: ActiveFault) => Math.min(...fault.lines.map(line => kmToLine(lat, lng, line)));

function lengthKm(points: [number, number][]) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const kx = Math.cos((((ay + by) / 2) * Math.PI) / 180) * 111.32;
    total += Math.hypot((bx - ax) * kx, (by - ay) * 110.57);
  }
  return total;
}

export default function FaultsExplainer({ main, onShow }: { main: Earthquake | null; onShow: () => void }) {
  const [pedroMiguel, limon, gatun] = ACTIVE_FAULTS;
  const cityKm = Math.round(kmToFault(CITY.lat, CITY.lng, pedroMiguel));
  const mapped = Math.round(pedroMiguel.lines.reduce((sum, line) => sum + lengthKm(line), 0) / 5) * 5;
  const mainKm = main ? Math.round(Math.min(...ACTIVE_FAULTS.map(fault => kmToFault(main.geometry.coordinates[1], main.geometry.coordinates[0], fault))) / 10) * 10 : null;

  return (
    <details className="usgs-card faults-explainer">
      <summary>
        <strong>Las fallas activas junto al Canal: Pedro Miguel, Limón y Gatún</strong>
      </summary>
      <div className="usgs-body">
        <section aria-labelledby="fe-what">
          <h3 id="fe-what">Qué es</h3>
          <p>
            Una <strong>falla activa en tierra</strong> que corre de norte a sur por la zona del Canal, cerca de las esclusas de Pedro Miguel, a unos{" "}
            <strong>{cityKm} km del centro histórico de la ciudad de Panamá</strong>. En el mapa se ven unos {mapped} km de su trazado. Es{" "}
            {pedroMiguel.kind}. Más al norte sigue la <strong>{limon.name}</strong>, que forma un mismo sistema con ella, y cruzando el centro del país,
            junto al lago Gatún, está la <strong>{gatun.name}</strong>.
          </p>
          <button type="button" className="btn btn-secondary btn-small" onClick={onShow}>
            <MapPin aria-hidden="true" size={18} /> Ver las fallas en el mapa
          </button>
        </section>

        <section aria-labelledby="fe-known">
          <h3 id="fe-known">Lo que se sabe</h3>
          {ACTIVE_FAULTS.map(fault => (
            <div key={fault.id} className="fe-fault">
              <h4>{fault.name}</h4>
              <ul>{fault.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
            </div>
          ))}
          <p>
            Los estudios concluyen que estas fallas son un peligro sísmico importante para el centro del país, el Canal y la ciudad de Panamá.
          </p>
        </section>

        <section aria-labelledby="fe-october">
          <h3 id="fe-october">¿Tiene que ver con el terremoto del 9 de octubre?</h3>
          <p>
            Son estructuras distintas: el terremoto de magnitud 7.7 ocurrió frente a la costa del Pacífico
            {mainKm !== null && <>, a unos <strong>{mainKm} km</strong> de la más cercana de estas fallas</>}, y sus réplicas siguen en esa zona. No hay forma de saber si un
            sismo grande en un lugar adelanta o retrasa otro en una falla lejana, y <strong>nadie puede predecir cuándo ocurrirá un sismo</strong>.
          </p>
        </section>

        <section aria-labelledby="fe-do">
          <h3 id="fe-do">Qué hacer con esta información</h3>
          <p>
            Lo mismo que en todo el país: tener a mano la mochila de emergencia, saber dónde protegerte en casa y en el trabajo y acordar con tu familia
            cómo comunicarse. Vivir cerca de una falla no cambia qué hacer durante un sismo: agáchate, cúbrete y sujétate.
          </p>
        </section>

        <p className="fe-source">
          Fuentes: Rockwell, Gath, González y otros (2010), «Neotectonics and paleoseismology of the Limón and Pedro Miguel faults in Panamá», Bulletin of the
          Seismological Society of America 100(6):3097-3129, doi:10.1785/0120090342. Gath, González, Rockwell y Franceschi, «Tectonic geomorphology and
          paleoseismology of the Gatún fault in central Panamá», 35.º Congreso Geológico Internacional, resumen 1270. {ACTIVE_FAULTS_SOURCE}. Los trazados
          están mapeados a escalas de 1:75 000 a 1:300 000: la posición real puede diferir unos cientos de metros.
        </p>
      </div>
    </details>
  );
}
