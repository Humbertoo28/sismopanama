"use client";

// Pinta la superficie de la vista 3D (la imagen satelital y la onda de sacudida) con WebGL: una sola malla con perspectiva
// correcta en vez de cientos de triángulos recortados uno a uno en el lienzo 2D, que era lo que más tardaba al girar la
// escena (sobre todo en teléfonos). El resultado es un lienzo transparente que el lienzo 2D copia con drawImage. Si el
// navegador no tiene WebGL 2, `createSurfaceGL` devuelve null y la vista usa el dibujo 2D de siempre (app/satellite-tiles.ts).

import { mercatorX, mercatorY, type Mosaic } from "./satellite-tiles";

const VERTEX = `#version 300 es
in vec4 aPos;
in vec2 aUv;
in float aShade;
out vec2 vUv;
out float vShade;
void main() {
  vUv = aUv;
  vShade = aShade;
  gl_Position = aPos;
}`;

// Los colores llegan con el alfa ya multiplicado, que es lo que espera el lienzo.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uClip;
in vec2 vUv;
in float vShade;
out vec4 outColor;
void main() {
  if (uClip > 0.5 && (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0)) discard;
  vec4 color = texture(uTex, vUv);
  // Sombreado del relieve (1 = plano): las laderas al sol más claras y las de sombra más oscuras.
  outColor = vec4(min(color.rgb * vShade, vec3(color.a)), color.a);
}`;

type Bounds = { west: number; east: number; south: number; north: number };
// `depth` crece hacia quien mira (como en la proyección de la vista 3D): con relieve, lo cercano tapa a lo lejano. `shade`: luz
// sobre el terreno en ese punto (1 = plano).
type Projected = { sx: number; sy: number; k: number; depth?: number; shade?: number };

export type SurfaceGL = {
  canvas: HTMLCanvasElement;
  // Falso si el navegador perdió el contexto gráfico: se deja de usar y se vuelve al dibujo 2D.
  usable: () => boolean;
  // Sube la imagen satelital (otra vez solo si cambió `version`). Falso si no cabe en la tarjeta gráfica.
  setMosaic: (mosaic: Mosaic, version: number) => boolean;
  // Sube la onda de sacudida: nx × ny píxeles RGBA (fila 0 = norte) con el alfa ya multiplicado.
  setWave: (pixels: Uint8Array, nx: number, ny: number) => void;
  // Pinta la malla de la superficie. `project` da la posición en pantalla (en px CSS) y el factor de perspectiva k.
  drawMosaic: (size: { w: number; h: number; dpr: number }, bounds: Bounds, mosaic: Mosaic, project: (lng: number, lat: number) => Projected, cols: number, rows: number) => void;
  drawWave: (size: { w: number; h: number; dpr: number }, bounds: Bounds, waveBounds: Bounds, project: (lng: number, lat: number) => Projected, cols: number, rows: number) => void;
  dispose: () => void;
};

export function createSurfaceGL(): SurfaceGL | null {
  let canvas: HTMLCanvasElement;
  let gl: WebGL2RenderingContext | null;
  try {
    canvas = document.createElement("canvas");
    gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, stencil: false, powerPreference: "low-power" });
  } catch {
    return null;
  }
  if (!gl) return null;
  const g = gl;

  const compile = (type: number, source: string) => {
    const shader = g.createShader(type);
    if (!shader) return null;
    g.shaderSource(shader, source);
    g.compileShader(shader);
    return g.getShaderParameter(shader, g.COMPILE_STATUS) ? shader : null;
  };
  const [vertex, fragment] = [compile(g.VERTEX_SHADER, VERTEX), compile(g.FRAGMENT_SHADER, FRAGMENT)];
  const program = g.createProgram();
  if (!vertex || !fragment || !program) return null;
  g.attachShader(program, vertex);
  g.attachShader(program, fragment);
  g.linkProgram(program);
  if (!g.getProgramParameter(program, g.LINK_STATUS)) return null;
  g.useProgram(program);
  const [aPos, aUv, aShade] = [g.getAttribLocation(program, "aPos"), g.getAttribLocation(program, "aUv"), g.getAttribLocation(program, "aShade")];
  const [uTex, uClip] = [g.getUniformLocation(program, "uTex"), g.getUniformLocation(program, "uClip")];

  const vao = g.createVertexArray();
  const [posBuffer, uvBuffer, shadeBuffer, indexBuffer] = [g.createBuffer(), g.createBuffer(), g.createBuffer(), g.createBuffer()];
  g.bindVertexArray(vao);
  g.bindBuffer(g.ARRAY_BUFFER, posBuffer);
  g.enableVertexAttribArray(aPos);
  g.vertexAttribPointer(aPos, 4, g.FLOAT, false, 0, 0);
  g.bindBuffer(g.ARRAY_BUFFER, uvBuffer);
  g.enableVertexAttribArray(aUv);
  g.vertexAttribPointer(aUv, 2, g.FLOAT, false, 0, 0);
  g.bindBuffer(g.ARRAY_BUFFER, shadeBuffer);
  g.enableVertexAttribArray(aShade);
  g.vertexAttribPointer(aShade, 1, g.FLOAT, false, 0, 0);
  g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, indexBuffer);
  g.disable(g.BLEND);
  // Con relieve, una montaña de adelante tapa lo que queda detrás de ella.
  g.enable(g.DEPTH_TEST);
  g.depthFunc(g.LEQUAL);

  const anisotropy = g.getExtension("EXT_texture_filter_anisotropic");
  const maxAnisotropy = anisotropy ? Math.min(4, g.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1;
  const texture = (unit: number, mipmaps: boolean) => {
    const tex = g.createTexture();
    g.activeTexture(g.TEXTURE0 + unit);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, mipmaps ? g.LINEAR_MIPMAP_LINEAR : g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    if (mipmaps && anisotropy) g.texParameterf(g.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
    return tex;
  };
  const [mosaicTex, waveTex] = [texture(0, true), texture(1, false)];
  let mosaicSeen: { mosaic: Mosaic; version: number } | null = null;
  // Un mosaico con imágenes de otro sitio sin CORS es un lienzo «contaminado»: no se puede leer, y se pinta en 2D.
  let blocked: Mosaic | null = null;
  let lost = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  let positions = new Float32Array(0);
  let uvs = new Float32Array(0);
  let depths = new Float32Array(0);
  let shades = new Float32Array(0);
  let meshShape = "";
  const draw = (unit: number, clip: boolean, { w, h, dpr }: { w: number; h: number; dpr: number }, bounds: Bounds, uv: (lng: number, lat: number) => [number, number], project: (lng: number, lat: number) => Projected, cols: number, rows: number) => {
    const [pw, ph] = [Math.round(w * dpr), Math.round(h * dpr)];
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    g.viewport(0, 0, pw, ph);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    const count = (cols + 1) * (rows + 1);
    if (meshShape !== `${cols}x${rows}`) {
      meshShape = `${cols}x${rows}`;
      positions = new Float32Array(count * 4);
      uvs = new Float32Array(count * 2);
      depths = new Float32Array(count);
      shades = new Float32Array(count);
      const indices = new Uint32Array(cols * rows * 6);
      let n = 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = j * (cols + 1) + i;
          indices.set([a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1], n);
          n += 6;
        }
      }
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, indexBuffer);
      g.bufferData(g.ELEMENT_ARRAY_BUFFER, indices, g.STATIC_DRAW);
    }
    for (let j = 0; j <= rows; j++) {
      const lat = bounds.north - ((bounds.north - bounds.south) * j) / rows;
      for (let i = 0; i <= cols; i++) {
        const lng = bounds.west + ((bounds.east - bounds.west) * i) / cols;
        const { sx, sy, k, depth = 0, shade = 1 } = project(lng, lat);
        const v = j * (cols + 1) + i;
        // Con el divisor de la perspectiva (w = 1/k) metido en la posición, la tarjeta interpola la imagen sin deformarla.
        const wv = 1 / k;
        positions[v * 4] = ((sx / w) * 2 - 1) * wv;
        positions[v * 4 + 1] = (1 - (sy / h) * 2) * wv;
        positions[v * 4 + 3] = wv;
        depths[v] = depth;
        shades[v] = shade;
        const [u, t] = uv(lng, lat);
        uvs[v * 2] = u;
        uvs[v * 2 + 1] = t;
      }
    }
    // Profundidad de cada vértice llevada a [-1, 1] (lo más cercano a quien mira, -1), con el mismo divisor de perspectiva.
    let [near, far] = [-Infinity, Infinity];
    for (let v = 0; v < count; v++) {
      near = Math.max(near, depths[v]);
      far = Math.min(far, depths[v]);
    }
    const span = Math.max(near - far, 1e-6);
    for (let v = 0; v < count; v++) {
      const ndc = 0.98 - 1.96 * ((depths[v] - far) / span);
      positions[v * 4 + 2] = ndc * positions[v * 4 + 3];
    }
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, posBuffer);
    g.bufferData(g.ARRAY_BUFFER, positions, g.DYNAMIC_DRAW);
    g.bindBuffer(g.ARRAY_BUFFER, uvBuffer);
    g.bufferData(g.ARRAY_BUFFER, uvs, g.DYNAMIC_DRAW);
    g.bindBuffer(g.ARRAY_BUFFER, shadeBuffer);
    g.bufferData(g.ARRAY_BUFFER, shades, g.DYNAMIC_DRAW);
    g.uniform1i(uTex, unit);
    g.uniform1f(uClip, clip ? 1 : 0);
    g.drawElements(g.TRIANGLES, cols * rows * 6, g.UNSIGNED_INT, 0);
  };

  return {
    canvas,
    usable: () => !lost && !g.isContextLost(),
    setMosaic(mosaic, version) {
      if (mosaic.canvas.width > g.getParameter(g.MAX_TEXTURE_SIZE) || mosaic.canvas.height > g.getParameter(g.MAX_TEXTURE_SIZE)) return false;
      if (blocked === mosaic) return false;
      if (mosaicSeen && mosaicSeen.mosaic === mosaic && mosaicSeen.version === version) return true;
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, mosaicTex);
      g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      try {
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, mosaic.canvas);
      } catch {
        blocked = mosaic;
        mosaicSeen = null;
        return false;
      }
      mosaicSeen = { mosaic, version };
      g.generateMipmap(g.TEXTURE_2D);
      return true;
    },
    setWave(pixels, nx, ny) {
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, waveTex);
      g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, nx, ny, 0, g.RGBA, g.UNSIGNED_BYTE, pixels);
    },
    drawMosaic(size, bounds, { plan }, project, cols, rows) {
      const [tilesX, tilesY] = [plan.x1 - plan.x0 + 1, plan.y1 - plan.y0 + 1];
      // La imagen está en proyección Web Mercator: la latitud no es lineal en ella, pero sí entre un vértice y el siguiente.
      draw(0, false, size, bounds, (lng, lat) => [(mercatorX(lng, plan.z) - plan.x0) / tilesX, (mercatorY(lat, plan.z) - plan.y0) / tilesY], project, cols, rows);
    },
    drawWave(size, bounds, waveBounds, project, cols, rows) {
      draw(1, true, size, bounds, (lng, lat) => [(lng - waveBounds.west) / (waveBounds.east - waveBounds.west), (waveBounds.north - lat) / (waveBounds.north - waveBounds.south)], project, cols, rows);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      g.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
