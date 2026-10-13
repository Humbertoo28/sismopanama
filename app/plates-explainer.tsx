import type { Earthquake } from "../lib/earthquakes";
import { KIND_INFO, PLATE_BOUNDARIES, PLATE_SHORT, nearestBoundary, type BoundaryKind } from "../lib/plates";

const KINDS: BoundaryKind[] = ["subduction", "transform", "divergent", "convergent"];
const MORE: Record<BoundaryKind, string> = {
  subduction: "Una placa se hunde bajo otra. Aquí ocurren los sismos más grandes del planeta.",
  transform: "Las placas se deslizan de lado, una junto a la otra, como dos manos que se frotan.",
  divergent: "Las placas se separan y por la grieta sube roca nueva.",
  convergent: "Las placas se empujan una contra otra y la corteza se comprime y se levanta.",
};

// Explicación sencilla de las placas tectónicas y de cómo encaja el sismo principal. La parte de Panamá y del sismo se
// apoya en el «Resumen tectónico» que publica el USGS para este evento; los límites del mapa son del modelo PB2002.
export default function PlatesExplainer({ main }: { main: Earthquake }) {
  const [lng, lat, depth] = main.geometry.coordinates;
  const near = nearestBoundary(lat, lng);
  const km = near ? Math.max(5, Math.round(near.km / 5) * 5) : null;
  // Tipos de límite con que el modelo dibuja ese mismo contacto (el de Nazca y Panamá mezcla varios).
  const kinds = near ? [...new Set(PLATE_BOUNDARIES.filter(b => b.a === near.boundary.a && b.b === near.boundary.b).map(b => b.kind))] : [];
  const kindNames = kinds.map(kind => KIND_INFO[kind].name.toLowerCase());
  const kindList = kindNames.length > 1 ? `${kindNames.slice(0, -1).join(", ")} y ${kindNames[kindNames.length - 1]}` : kindNames[0];

  return (
    <details className="usgs-card plates-explainer">
      <summary>
        <strong>Las placas tectónicas, explicadas</strong>
      </summary>
      <div className="usgs-body">
        <section aria-labelledby="pe-what">
          <h3 id="pe-what">Qué son</h3>
          <p>
            La capa rígida exterior de la Tierra está partida en grandes piezas, las <strong>placas tectónicas</strong>. Se apoyan sobre roca caliente
            que fluye muy despacio y se mueven unos pocos centímetros por año. Donde dos placas se tocan hay un <strong>límite</strong>, y la mayoría de los
            terremotos del mundo ocurren en esos límites.
          </p>
        </section>

        <section aria-labelledby="pe-why">
          <h3 id="pe-why">Por qué tiembla</h3>
          <p>
            Los límites no resbalan con suavidad: se traban. Durante años o siglos se acumula esfuerzo, como en un resorte que se comprime, y cuando la roca ya no
            aguanta se rompe por una <strong>falla</strong> y esa energía sale de golpe. Eso es un sismo. Las réplicas son los reacomodos que siguen después.
          </p>
        </section>

        <section aria-labelledby="pe-kinds">
          <h3 id="pe-kinds">Los cuatro tipos de límite (los colores del mapa)</h3>
          <ul className="plate-kinds">
            {KINDS.map(kind => (
              <li key={kind}>
                <i aria-hidden="true" className={kind === "subduction" ? "dashed" : ""} style={{ background: KIND_INFO[kind].color, color: KIND_INFO[kind].color }} />
                <span><strong>{KIND_INFO[kind].name}.</strong> {MORE[kind]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="pe-panama">
          <h3 id="pe-panama">Panamá, en medio de varias placas</h3>
          <p>
            Según el resumen tectónico del USGS, Panamá queda cerca de la unión de varias placas grandes: las placas oceánicas del <strong>Coco</strong> y de{" "}
            <strong>Nazca</strong> al oeste y al sur, y las placas del <strong>Caribe</strong> y <strong>Sudamericana</strong> al norte y al este. Todas rodean a una
            placa pequeña, la <strong>microplaca de Panamá</strong>, donde está el país.
          </p>
          <p>
            En el borde sur, la placa del Coco se hunde bajo la microplaca de Panamá y la de Nazca se acerca a ella en diagonal; en el borde norte, la placa del Caribe se
            hunde bajo ella. Por eso la región tiene tantos sismos.
          </p>
        </section>

        <section aria-labelledby="pe-quake">
          <h3 id="pe-quake">El sismo del 9 de octubre</h3>
          <ul>
            <li>Magnitud {main.properties.mag?.toFixed(1) ?? "—"}{Number.isFinite(depth) ? `, a unos ${Math.round(depth!)} km de profundidad` : ""}.</li>
            <li>
              El USGS indica que su mecanismo es de <strong>falla de desplazamiento lateral izquierdo</strong>: los dos lados de la falla se movieron en horizontal, uno
              respecto al otro (parado en un lado, el otro se mueve hacia tu izquierda). Según el USGS, es un estilo de deformación común en este límite complejo.
            </li>
            {near && km !== null && (
              <li>
                En el mapa, el contacto de placas más cercano al epicentro es <strong>{PLATE_SHORT[near.boundary.a]} | {PLATE_SHORT[near.boundary.b]}</strong>, a unos {km} km.
                {kinds.length > 1 && <> Es un contacto complejo: el modelo lo dibuja con tramos de varios tipos ({kindList}), por eso en el mapa ves varios colores.</>}
                {" "}Las líneas son aproximadas: esto ubica la zona tectónica, no la falla exacta.
              </li>
            )}
            <li>
              La sismicidad histórica de la región se ha concentrado más al oeste, en la <strong>Zona de Fractura de Panamá</strong>, el límite de rumbo norte-sur
              entre las placas del Coco y de Nazca. El USGS menciona un sismo de magnitud 7.5 en julio de 1934 y uno de 7.2 en julio de 1962.
            </li>
          </ul>
        </section>

        <section aria-labelledby="pe-map">
          <h3 id="pe-map">Cómo verlo en el mapa</h3>
          <p>Activa <strong>Placas tectónicas</strong> en las capas del mapa (en el 2D y en el 3D): las líneas llevan el nombre de las dos placas que separa cada límite.</p>
        </section>

        <p className="usgs-source">
          Fuentes: <a href="https://earthquake.usgs.gov/earthquakes/eventpage/us6000u18k/executive" target="_blank" rel="noopener noreferrer">resumen tectónico del USGS para este sismo<span aria-hidden="true"> ↗</span></a>{" "}
          y el modelo de límites de placas PB2002 de Peter Bird (<a href="https://doi.org/10.1029/2001GC000252" target="_blank" rel="noopener noreferrer">2003<span aria-hidden="true"> ↗</span></a>),
          en la conversión de Hugo Ahlenius (Nordpil, licencia ODC-By). El modelo no es de una agencia de gobierno y sus líneas son aproximadas.
        </p>
      </div>
    </details>
  );
}
