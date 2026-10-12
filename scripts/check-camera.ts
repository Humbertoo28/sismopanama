// Comprueba app/quake-3d-camera.ts: node --experimental-strip-types scripts/check-camera.ts
// @ts-expect-error Node necesita la extensión .ts; el compilador de la web no la admite en importaciones.
import { exploring, homeFor, makeProjection, marginsFor, orbit, type Camera, type SceneInfo } from "../app/quake-3d-camera.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok " : "MAL"} ${name}${detail ? `: ${detail}` : ""}`);
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// Una escena como la de la web: Panamá con un margen de 0,3°, 60 km de profundidad y la profundidad ×4.
function sceneOf(floorKm: number): SceneInfo {
  const [west, east, south, north] = [-83.4, -76.9, 6.9, 9.9];
  const [lat0, lng0] = [(south + north) / 2, (west + east) / 2];
  const kmLng = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  return {
    south, north, west, east, lat0, lng0, floorKm,
    toKm: (lng, lat) => ({ x: (lng - lng0) * kmLng, y: (lat - lat0) * 110.57 }),
    halfW: ((east - west) / 2) * kmLng, halfH: ((north - south) / 2) * 110.57,
  };
}

for (const [w, h, exaggeration] of [[941, 630, 4], [1400, 700, 1], [360, 400, 8], [390, 560, 4]] as const) {
  const scene = sceneOf(60);
  const home = homeFor(w, h);
  const label = `${w}×${h} ×${exaggeration}`;
  const [marginL, marginR, marginV] = marginsFor(w);
  const at = (c: Camera) => makeProjection(scene, c, w, h, exaggeration);

  // 1) La escala no depende del ángulo: la caja entera, vista desde cualquier lado, ocupa lo que ocupa con el zoom elegido, y
  //    el centro de la caja cae siempre en el mismo punto de la pantalla (girar no mueve ni acerca la escena).
  const centers: [number, number][] = [];
  for (const yaw of [0, 37, 90, 180, 271]) {
    for (const pitch of [4, 30, 46, 75, 90]) {
      const p = at({ yaw, pitch, zoom: 1, px: 0, py: 0 });
      const c = p.project({ x: 0, y: 0, z: -(scene.floorKm * exaggeration) / 2 });
      centers.push([c.sx, c.sy]);
    }
  }
  check(`${label}: el centro de la caja no se mueve al girar`, centers.every(([x, y]) => near(x, centers[0][0], 1e-6) && near(y, centers[0][1], 1e-6)));
  const homeCam = at(home);
  const corners = ([scene.south, scene.north] as const).flatMap(lat => ([scene.west, scene.east] as const).flatMap(lng => [homeCam.at(lng, lat, 0), homeCam.at(lng, lat, scene.floorKm)])).map(homeCam.project);
  const xs = corners.map(c => c.sx);
  const ys = corners.map(c => c.sy);
  const tight = near(Math.min(...xs), marginL, 1e-6) && near(Math.max(...xs), w - marginR, 1e-6);
  const tightY = near(Math.min(...ys), marginV, 1e-6) && near(Math.max(...ys), h - marginV, 1e-6);
  check(`${label}: en la vista inicial la caja llena justo el encuadre`, tight || tightY, `x ${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}, y ${Math.min(...ys).toFixed(1)}–${Math.max(...ys).toFixed(1)}`);
  const framed = homeCam.framing(home.yaw, home.pitch);
  check(`${label}: encuadrar la vista inicial da zoom 1 y sin desplazamiento`, near(framed.zoom, 1, 1e-9) && near(framed.px, 0, 1e-6) && near(framed.py, 0, 1e-6));

  // 2) El encuadre de cualquier ángulo deja la caja entera dentro, centrada, sin acercar más que el tope.
  for (const [yaw, pitch] of [[0, 90], [0, 4], [12, 46], [78, 48], [123, 20]] as const) {
    const f = homeCam.framing(yaw, pitch);
    const p = at({ yaw, pitch, zoom: f.zoom, px: f.px, py: f.py });
    const pts = ([scene.south, scene.north] as const).flatMap(lat => ([scene.west, scene.east] as const).flatMap(lng => [p.at(lng, lat, 0), p.at(lng, lat, scene.floorKm)])).map(p.project);
    const [x0, x1, y0, y1] = [Math.min(...pts.map(q => q.sx)), Math.max(...pts.map(q => q.sx)), Math.min(...pts.map(q => q.sy)), Math.max(...pts.map(q => q.sy))];
    const inside = x0 >= marginL - 1e-6 && x1 <= w - marginR + 1e-6 && y0 >= marginV - 1e-6 && y1 <= h - marginV + 1e-6;
    const centered = near((x0 + x1) / 2, marginL + (w - marginL - marginR) / 2, 1e-6) && near((y0 + y1) / 2, h / 2, 1e-6);
    check(`${label}: encuadre desde yaw ${yaw}, inclinación ${pitch}`, inside && centered, `zoom ${f.zoom.toFixed(2)}`);
    const capped = homeCam.framing(yaw, pitch, f.zoom / 2);
    check(`${label}: el tope de zoom se respeta (yaw ${yaw}, inclinación ${pitch})`, near(capped.zoom, f.zoom / 2, 1e-9));
  }

  // 3) El punto de la superficie que se ve en el centro es el eje de giro: no se mueve en pantalla al girar, y sigue siendo el
  //    mismo punto después del giro.
  const explored: Camera = { yaw: 30, pitch: 50, zoom: 3.2, px: -140, py: 60 };
  const before = at(explored);
  const pivot = before.surfacePoint(before.originX, h / 2);
  check(`${label}: el punto del centro está en la superficie`, near(pivot.z, 0, 1e-6), `z = ${pivot.z.toFixed(4)}`);
  const shown = before.project(pivot);
  // Si el centro cae fuera de la caja (escena muy movida), el eje se recorta al borde y ya no se ve justo en el centro.
  const clipped = Math.abs(pivot.x) >= scene.halfW - 1e-6 || Math.abs(pivot.y) >= scene.halfH - 1e-6;
  check(`${label}: el punto del centro se ve en el centro${clipped ? " (recortado a la caja)" : ""}`, clipped || (near(shown.sx, before.originX, 1e-6) && near(shown.sy, h / 2, 1e-6)));
  let camera = explored;
  let worst = 0;
  let drift = 0;
  for (const [yaw, pitch] of [[60, 50], [120, 35], [200, 70], [200, 88], [310, 25], [310, 12]] as const) {
    camera = orbit(scene, camera, yaw, pitch, w, h, exaggeration);
    const now = at(camera);
    const q = now.project(pivot);
    // El eje se queda donde estaba en pantalla (donde se veía antes de girar), no necesariamente en el centro exacto: si el
    // centro cae fuera de la caja, el eje se recorta al borde.
    worst = Math.max(worst, Math.hypot(q.sx - shown.sx, q.sy - shown.sy));
    // Mirando desde bastante arriba, el punto del centro es el de la superficie: recalcularlo da el mismo eje.
    if (pitch >= 25 && near(shown.sx, before.originX, 1e-6) && near(shown.sy, h / 2, 1e-6)) {
      const again = now.surfacePoint(now.originX, h / 2);
      drift = Math.max(drift, Math.hypot(again.x - pivot.x, again.y - pivot.y));
    }
    check(`${label}: tras girar a yaw ${yaw}, inclinación ${pitch} el zoom no cambió`, camera.zoom === explored.zoom);
  }
  check(`${label}: al girar explorando, el punto del centro no se mueve`, worst < 0.05, `máx. ${worst.toFixed(4)} px`);
  check(`${label}: el eje de giro no se desplaza al girar varias veces`, drift < 0.5, `máx. ${drift.toFixed(4)} km`);

  // 4) Con la vista general, girar no mueve la escena (gira alrededor de la caja); explorando, la vista general no existe.
  const overview = orbit(scene, home, 140, 30, w, h, exaggeration);
  check(`${label}: con la vista general solo cambian los ángulos`, overview.px === 0 && overview.py === 0 && overview.zoom === 1);
  check(`${label}: grado de exploración`, exploring(home, w, h) === 0 && exploring(explored, w, h) === 1 && exploring({ ...home, zoom: 0.8 }, w, h) === 0);
}

console.log(failed ? `\n${failed} comprobaciones fallaron` : "\nTodo bien");
process.exit(failed ? 1 : 0);
