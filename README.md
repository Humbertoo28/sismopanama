# 🇵🇦 Sismo Panamá - Monitor Sísmico y Alertas en Tiempo Real

> **Observatorio cívico y sistema de alerta temprana ante réplicas y eventos sísmicos en la República de Panamá.**  
> Desarrollado por **Humberto Antonio** ([@humbertiex](https://www.instagram.com/humbertiex_)).

🌐 **Sitio Web Oficial en Producción:** [ojopanama.com](https://www.ojopanama.com)

---

## 📌 Contexto e Impacto

Tras el histórico sismo de **Magnitud 7.7** ocurrido frente a las costas del Pacífico de Panamá el **9 de octubre de 2026**, nació **Sismo Panamá** como una iniciativa cívica de código abierto para entregar información científica verificada y alertas sonoras inmediatas a la ciudadanía sin depender de tiendas de aplicaciones de pago.

### 📊 Métricas de Escala (Primeras 24 horas):
- **+10,000 dispositivos suscritos** a alertas push en tiempo real.
- **+21,000 visitantes únicos** y más de **130,000 visualizaciones de página**.
- **Picos de concurrencia:** Más de **2,480 personas conectadas simultáneamente**.
- **Tiempo de respuesta:** Promedio de **~330 ms** en la red global de Vercel Edge.

---

## 🚀 Características Principales

1. **Triangulación Multifuente 24/7:**
   - **Instituto de Geociencias de la Universidad de Panamá (IGC-UP):** Red Sísmica Nacional.
   - **United States Geological Survey (USGS):** Monitoreo global de alta precisión.
   - **Centro Sismológico Euromediterráneo (EMSC):** Detección rápida regional.
   - Conmutación automática: si una agencia experimenta caídas, las otras asumen sin interrupción del servicio.
   - Un sismo que **solo publica el EMSC** se muestra como «Sin confirmar» y no dispara alertas hasta que el IGC o el USGS lo confirmen (ver «🚨 Sismos sin confirmar» más abajo).

2. **Alertas Web Push en Segundo Plano (Sin App Store):**
   - Funciona mediante el estándar **W3C Web Push API** y **VAPID**.
   - Notificaciones con sonido y vibración en **Android** (Google Chrome) y **iOS** (Safari PWA en pantalla de inicio).
   - Entrega masiva en paralelo (hasta 250 conexiones simultáneas) notificando a miles de celulares en menos de 3 segundos.

3. **Mapa Interactivo y Filtros Geográficos:**
   - Renderizado con Leaflet y mosaicos satelitales/topográficos de ArcGIS y OpenStreetMap.
   - Clasificación inteligente de réplicas ligadas al sismo principal M 7.7.
   - Filtros por magnitud mínima (M ≥ 3.0, M ≥ 4.0, M ≥ 5.0).

4. **Panel de Análisis Científico (`/analisis`):**
   - Histogramas de distribución de profundidad tectónica.
   - Gráfica de evolución temporal de energía liberada y réplicas acumuladas.
   - Contraste de magnitud reportada entre agencias oficiales.

5. **Diseñado para Emergencias y Ahorro Extremo de Recursos:**
   - **Edge Caching:** La red CDN de Vercel absorbe las visitas sin saturar el backend.
   - **Apagado en segundo plano:** Si el usuario minimiza la pestaña, el navegador suspende las peticiones para no agotar la batería del usuario ni la cuota del servidor.

---

## 🛠️ Stack Tecnológico

- **Frontend / Framework:** [Next.js](https://nextjs.org/) (App Router), React 19, TypeScript, Tailwind CSS / Vanilla CSS optimizado.
- **Mapas y Gráficos:** [Leaflet](https://leafletjs.com/), [Recharts](https://recharts.org/), D3 format/scale.
- **Base de Datos & Backend:** [Supabase](https://supabase.com/) (PostgreSQL con Row Level Security + `pg_cron`).
- **Infraestructura Serverless:** [Vercel](https://vercel.com/) (Fluid Compute Edge Network + WAF Rate Limiting).
- **Protocolo de Notificaciones:** Web Push (ECDSA P-256 VAPID).
- **Automatización CI/CD:** GitHub Actions (respaldo de cron 24/7).

---

## 💻 Instalación y Desarrollo Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/Humbertoo28/sismopanama.git
cd sismopanama
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia el archivo de ejemplo y configura tus credenciales:
```bash
cp .env.example .env.local
```

Genera tus claves VAPID para notificaciones:
```bash
npx web-push generate-vapid-keys
```

### 4. Configurar Base de Datos en Supabase
Ejecuta el archivo [`supabase/schema.sql`](supabase/schema.sql) en el Editor SQL de tu proyecto en Supabase para crear las tablas `push_subscriptions` y `notified_quakes` con sus políticas RLS.

### 5. Iniciar el servidor local
```bash
npm run dev
```
Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

## 🔔 Alertas con la app cerrada: si se queda en «Conectando…»

**Qué pasaba.** En la ventana de alertas, el botón «Activar 24/7» podía quedarse en «Conectando…» sin terminar, con «No activado», y la revisión de abajo seguía diciendo «Falta dar el permiso» aunque el permiso ya estuviera dado.

**Causa.** Crear la suscripción depende de pasos que el teléfono puede no contestar nunca: que el *service worker* esté listo y que el servicio de notificaciones de Apple o Google responda. Ninguno tenía tiempo límite, así que la espera no terminaba y no se sabía cuál fallaba. Además la revisión leía el permiso una sola vez, al abrirse.

**Qué se cambió** (`lib/alert-system.ts`, `app/alert-modal.tsx`, `app/push-diagnostics.tsx`):
- Cada paso tiene un tiempo máximo (service worker 8 s, clave del servidor 8 s, suscripción 20 s, guardado 15 s) y, si se agota, el mensaje dice cuál fue.
- Si no hay service worker registrado se registra en ese momento; si está atascado, se borra y se crea de nuevo una vez.
- El permiso ya decidido no se vuelve a pedir en el mismo toque (en iPhone esa segunda petición a veces no contesta).
- El botón siempre se libera, pase lo que pase.
- La revisión «¿No te llegan las alertas…?» ahora comprueba el *service worker* y se vuelve a ejecutar sola cuando cambia el permiso.
- El mensaje de error se ve con su propio fondo, legible con el tema claro y el oscuro.

**Qué hacer si aparece un mensaje:**

| Mensaje | Qué hacer |
|---|---|
| «El servicio de alertas de la app no arrancó…» | Cerrar la app por completo (deslizarla hacia arriba en el selector de apps), abrirla y pulsar «Activar 24/7». |
| «Tu teléfono no terminó de crear la suscripción…» | Lo mismo; si sigue igual, pulsar «Reparar» en la revisión de abajo. |
| «No se pudo pedir al servidor la clave…» o «El servidor no respondió a tiempo…» | Revisar la conexión y volver a intentarlo. |

**iPhone.** Instala la app desde `https://www.ojopanama.com`. Las direcciones `ojopanama.com` y `sismopanama.vercel.app` redirigen (308) a `www`, y un *service worker* no se puede registrar detrás de una redirección: si la app se instaló desde una de ellas, bórrala de la pantalla de inicio y vuelve a instalarla desde `www`. (Esta causa no está confirmada en un iPhone real; es la recomendación segura.)

**Android, sobre todo Honor (MagicOS).** Si el teléfono acepta las alertas pero no sale nada con la app cerrada:
1. **Abre la página una vez** (en Chrome). Hasta el 12 de octubre de 2026 a las 15:41 (hora de Panamá) el servidor rechazaba las suscripciones de Chrome en Android que usan direcciones `jmtNN.google.com`, así que quien se suscribió antes quedó sin guardar. Desde ese arreglo, al abrir la página se vuelve a registrar sola; no hace falta hacer nada más.
2. **Batería de MagicOS.** Ajustes → Batería → *Inicio de aplicaciones* → Chrome → apagar «Gestionar automáticamente» y activar *Inicio automático*, *Inicio secundario* y *Ejecutar en segundo plano*. Bloquear Chrome en las apps recientes (candado), desactivar el ahorro de energía y reiniciar. MagicOS cierra Chrome en segundo plano y, cerrado, Google no puede entregarle el aviso.
3. **Notificaciones del sistema.** Ajustes → Notificaciones → Chrome: permitidas, con sonido y que se vean en la pantalla de bloqueo.
4. **Usar Chrome** y no el navegador de fábrica (este último no está probado).

**Qué se cambió en la app** (`app/push-diagnostics.tsx`): la revisión «¿No te llegan las alertas con la app cerrada?» ahora trae, en Android, una guía propia para **Honor y Huawei** (MagicOS / EMUI) con los pasos de batería de arriba, la indicación de bloquear Chrome en las apps recientes y la recomendación de usar Chrome. Antes solo mencionaba Xiaomi, Huawei y Samsung.

El servidor no es el cuello de botella: en cada sismo Google (FCM) y Apple aceptan más del 99.9 % de los envíos (13 de octubre, 13:36 UTC, sismo M 4.1: 28 172 de 28 213; las 41 rechazadas son casi todas suscripciones caducadas que se dan de baja). Que Google lo acepte no garantiza que el teléfono lo muestre: si MagicOS tiene cerrado Chrome, el aviso no aparece.

**Cómo se probó.** En el navegador de escritorio, simulando un *service worker* que nunca arranca y un servicio de notificaciones que nunca contesta: el botón se recupera a los 16 s y a los 20 s con el mensaje correspondiente, y el camino normal (todo responde) sigue suscribiendo en menos de 1 s. No se ha probado todavía en un iPhone real.

---

## 📊 Gráficas interactivas y animadas

Todas las gráficas usan **solo sismos que los catálogos (USGS, IGC, EMSC) ya publicaron**: las animaciones y la interacción no calculan, estiman ni proyectan nada. La reproducción de la secuencia, por ejemplo, muestra los sismos reales en su orden real; lo único comprimido es el tiempo de la animación.

**Qué cambió en cada gráfica**

| Gráfica | Ahora |
|---|---|
| **Línea de tiempo** (`/analisis`) | Los puntos entran en orden cronológico (~0.9 s), crecen al pasar el cursor, hay una cruz punteada que sigue al cursor y los sismos nuevos llevan un aro que se expande 3 veces. **Acercar, alejar y desplazar** la ventana de tiempo con botones, arrastrando (si está acercada) o con Ctrl/⌘ + rueda (la rueda normal sigue haciendo scroll); ventana mínima de 5 min; la transición es suave y solo se dibujan los puntos de la ventana. **Reproducir secuencia**: los sismos aparecen uno a uno con su lectura (magnitud, lugar, día y hora) y una onda; dura entre 5 y 18 s (505 sismos: 18 s), con *Pausar / Seguir / Reiniciar / Detener*, y se puede ver en **pantalla completa** (más abajo). El eje de magnitud no se mueve al acercar ni al reproducir. |
| **Actividad** (barras y acumulado) | Las barras crecen y el área acumulada se dibuja al cargar o cambiar de gráfico. **Elegir un intervalo** (clic, o flechas + Enter con el teclado) lo resalta, acerca la línea de tiempo a ese tramo y filtra la tabla. |
| **Magnitudes y Profundidad** | Las barras crecen y los números cuentan cuando la gráfica llega a la pantalla. Cada fila es un botón: al elegirla se resaltan esos sismos en la línea de tiempo (los demás se apagan) y la tabla muestra solo esos. |
| **Indicadores** | Los números cuentan hacia su valor y las tarjetas entran escalonadas. |
| **Detalle del sismo** | Botones *Anterior / Siguiente* para recorrer los sismos en el tiempo, dentro de lo que esté seleccionado; si queda fuera de la ventana acercada, la ventana se corre hasta él. |
| **Secuencia** (página principal) | En la vista «Por horas» las barras crecen desde la izquierda, una fila tras otra. (La vista «Cada sismo» ya tenía su animación.) |
| **Historia sísmica** (`/historia`) | Los puntos del mapa y los números del mapa de los 12 mayores aparecen uno tras otro y reaccionan al cursor; el sismo de 2026 late; las barras de las décadas crecen al llegar a la pantalla (en navegadores sin esa función, al cargar). Solo CSS. |

**Selección cruzada.** Solo hay una selección a la vez (un intervalo, una banda de magnitud o una de profundidad). Aparece un aviso «Intervalo / Magnitud / Profundidad: … · N de M sismos resaltados» con *Quitar selección*; cambiar un filtro (periodo, magnitud, fuentes) la quita y deshace el zoom. Las bandas tienen `min` incluido y `max` excluido (`lib/analytics.ts`), la misma regla de las barras, así que lo resaltado coincide exactamente con el número de cada barra.

**Pantalla completa de la línea de tiempo** (publicada el 13 de octubre de 2026 en el commit `4b64d5d`, verificada en producción: el botón existe, la gráfica pasa de 320 a 682 px de alto y Escape la cierra; la reproducción) de la secuencia pasa rápido en una tarjeta pequeña; así se ve grande). Botón **«Pantalla completa»** junto a los controles (en el teléfono, solo el icono). Usa la pantalla completa del navegador y, si no la concede (iPhone, navegadores integrados), la línea de tiempo se amplía sobre toda la página: es el mismo criterio que la pantalla completa del mapa (`app/quake-map.tsx`).
- La gráfica llena el alto de la pantalla; zoom, arrastre, Ctrl/⌘ + rueda, pausa, seguir y reiniciar funcionan igual porque es el mismo componente con más espacio.
- La lectura de la reproducción (magnitud, lugar, hora) se hace más grande y pasa a la esquina **superior derecha**, para no tapar el sismo principal, que queda arriba a la izquierda.
- Al tocar un sismo aparece abajo una barra con su magnitud, lugar, hora, profundidad y fuente; el sismo queda elegido también en la página, así que al salir está el detalle de siempre.
- Se sale con el botón «Salir de la pantalla completa» o con **Escape**. Mientras está abierta, la página de abajo no se desplaza y Tab no sale de la línea de tiempo; en el respaldo sobre la página se anuncia como cuadro de diálogo (`role="dialog"`, `aria-modal`).
- En teléfono en horizontal (menos de 520 px de alto) los controles se compactan y quedan en una sola fila para que la gráfica conserve espacio. Con «Reducir animaciones» la entrada no se anima.
- El botón «Salir» de la reproducción pasó a llamarse **«Detener»**, para no confundirlo con salir de la pantalla completa.
- **La velocidad de la reproducción no cambió** (entre 5 y 18 s según cuántos sismos haya): la pantalla completa agranda la gráfica, no la hace más lenta. Si hace falta, el siguiente paso sería un selector de velocidad (0.5×, 1×, 2×).

**Accesibilidad y movimiento**
- Con **«Reducir animaciones»** (el interruptor del panel de accesibilidad o el ajuste del sistema) no hay animaciones ni transiciones, las barras de Recharts se dibujan completas de golpe y los números saltan al valor final (`app/analisis/motion.tsx`).
- Teclado: la gráfica de actividad se recorre con las flechas y se elige con Enter o espacio; las filas de magnitud y profundidad son botones (`aria-pressed`); todos los controles miden 40 px o más; la reproducción anuncia solo su inicio y su final (no cada sismo) por `aria-live`.
- Nada se dice solo con animación: lo que se resalta también está en el aviso de selección, la tabla y el texto de la ventana de tiempo.
- Corregido de paso: el pie de `/analisis` tenía texto gris sobre la banda azul del sitio (contraste 2.3; el mínimo es 4.5) y ya estaba así en producción; ahora usa los colores claros del pie del sitio.

**Cómo se probó**
- 25 pruebas con valores en los límites (magnitud 4.0, 4.99, 5.0; profundidad negativa, 10 km, sin dato; intervalos): lo resaltado siempre es igual al número de cada barra.
- En el navegador (desarrollo y `next build` + `next start`, que aplica la política de seguridad de producción): elegir intervalos y bandas con el ratón y con el teclado, acercar/alejar/desplazar con botones, arrastre y Ctrl + rueda, *Anterior/Siguiente*, quitar la selección, y la reproducción de 39 y 505 sismos en desarrollo (505 en ~18 s a ritmo constante; la animación usa un reloj real, así que si el navegador va lento muestra varios sismos juntos en vez de alargarse) y de 229 en producción (arranque, avance y «Detener»). También: la ventana mínima de 5 min, que al elegir un sismo fuera de la ventana esta se corre hasta él, que cambiar el periodo quita zoom y selección, la cruz punteada y el crecimiento del punto con un cursor real, el aro de un sismo nuevo (se simuló la llegada de uno falso, rotulado «PRUEBA LOCAL», solo en la pestaña de prueba) y que durante la reproducción la lectura no se anuncia a los lectores de pantalla (solo «Reproducción iniciada» y su final). Sin errores nuevos en la consola ni bloqueos de la política de seguridad.
- axe-core 4.11: **0 violaciones** en `/analisis` en escritorio (estado inicial, con selección y detalle, y durante la reproducción), en teléfono de 375 px (inicial y con selección), con el texto al 130 % (sin desborde horizontal) y en `/historia` (escritorio).
- Con «Reducir animaciones» activado: sin animaciones, sin transiciones y el área acumulada se dibuja completa al instante.
- Pantalla completa de la línea de tiempo (servidor de desarrollo, panel del navegador de pruebas): el respaldo sobre la página en 556×837, 1280×800 y 812×375 (teléfono en horizontal); la gráfica llena el alto (682 px en el primero) y vuelve a 320 px al salir; la reproducción de 507 sismos dentro de la pantalla completa (lectura legible en una línea, sin tapar el sismo principal), pausa, elegir un sismo (aparece la barra de abajo y queda elegido en la página), Escape, abrirla con el teclado (Enter) y que Tab dé la vuelta sin salir de la línea de tiempo, que el desplazamiento de la página se restaure al salir, y axe-core 4.11 con **0 violaciones** con la pantalla completa abierta. La ruta de la pantalla completa *nativa* se probó solo con la API simulada (entrar, salir con el botón, salir como si se pulsara Escape): el panel de pruebas no concede la real, y aquí también cae al respaldo.

**Lo que no se ha probado:** en un teléfono real, con VoiceOver o TalkBack, ni en Safari ni Firefox (solo Chromium). La pantalla completa nativa real (la que oculta la barra del navegador) no se vio funcionando en ningún navegador, ni el respaldo en un iPhone o iPad. Con 500 puntos la reproducción corrió a ~37 cuadros por segundo en desarrollo; no se midió en producción ni en teléfonos de gama baja, ni con más de ~1 000 sismos. En la prueba de producción el aviso de la selección y la reproducción se comprobaron, pero no se repitió la auditoría de axe en ese modo.

**Rendimiento** (medido en una compilación de producción local; la carga de red y el procesador de un teléfono real no se midieron)

| Qué | Antes | Ahora |
|---|---|---|
| JavaScript inicial de `/analisis` (comprimido) | 326 KB en 11 archivos (Recharts dentro del archivo principal, 116 KB) | **218 KB** (−33 %); Recharts va en un archivo propio de 106 KB que se pide aparte |
| Para comparar, otras páginas | `/` 273 KB · `/historia` 209 KB | sin cambios |
| Cuándo está listo el código de las gráficas | con el resto | 10–30 ms después de hidratar, mucho antes de que lleguen los datos (los datos tardaron ~470 ms con el servidor en frío) |
| Aviso de «Nuevo sismo» | quedaba **debajo de la cabecera fija** del sitio (la cabecera tiene `z-index: 1000`, el aviso 50) y su botón de cerrar no se podía tocar | aparece debajo de la cabecera; se puede cerrar; axe da 0 con el aviso visible, en escritorio y en teléfono |

- **Cómo se carga.** `dashboard.tsx` empieza a bajar `charts.tsx` y `timeline-panel.tsx` con `import()` al abrir la página, en paralelo con la consulta de los datos, y guarda los módulos en un estado. Mientras llegan se ve un marco del mismo alto (la página no salta); si fallan, un mensaje con «Reintentar». La leyenda y las barras de magnitud y profundidad no usan Recharts y viven en `app/analisis/bars.tsx`, así que no esperan a la librería.
- **Por qué no `next/dynamic`.** Se probó primero y a veces retrasaba las gráficas unos **300 ms** aunque el archivo ya estuviera descargado: React espera antes de cambiar un marco de «cargando» por su contenido. Con el estado explícito las gráficas aparecen 11–44 ms después de los datos.
- **Puntos de la línea de tiempo.** Cada punto pasó de 4 a 3 elementos del SVG y `memo` evita redibujar los que no cambiaron. **No se midió una mejora**: elegir un punto cuesta ~54 ms antes y ahora, elegir una banda 42 → 39 ms, quitar la selección 59 → 46 ms, dentro del ruido. Ese costo es de Recharts, no de los puntos.
- **Fluidez con 505 puntos, versión publicada, escritorio** (cuadros reales con el navegador visible): la reproducción completa corre a 59 cuadros por segundo, elegir una banda a 54 y el zoom a 42 (4 cuadros lentos, el peor de 83 ms): el zoom es lo más pesado porque cada cuadro vuelve a calcular toda la gráfica. **No se volvió a medir la fluidez de la versión nueva** (el panel del navegador de pruebas quedó oculto y no dibuja cuadros), así que no se afirma que haya mejorado ni empeorado.
- **Sin cambios en el camino rápido, con matices.** Con todo en caché y el servidor local, las gráficas aparecieron entre 86 y 119 ms tras cargar la página (antes 57–62 ms): una diferencia de decenas de milisegundos, del orden del ruido de la medición. El beneficio real es para quien abre la página por primera vez: ~108 KB menos de JavaScript que descargar y analizar antes de que respondan los filtros y los indicadores. Eso no se pudo medir sin una red o un teléfono lentos.

**Archivos:** `app/analisis/charts.tsx` (gráficas), `app/analisis/bars.tsx` (leyenda y barras horizontales), `app/analisis/timeline-panel.tsx` (zoom, desplazamiento, reproducción y pantalla completa), `app/analisis/motion.tsx` (reducir movimiento y «visto en pantalla»), `app/analisis/dashboard.tsx` (selección cruzada), `app/analisis/analisis.css`, `lib/analytics.ts` (rangos de las bandas), `app/analisis/format.ts` (pasos de 1, 2 y 5 min en el eje), `app/sequence-chart.tsx` y `app/globals.css`, `app/historia/*`.

---

## 🚨 Sismos «sin confirmar» (solo EMSC): no se avisan hasta que otro catálogo los confirme

**Qué pasó (13 de octubre de 2026).** A las 16:25 (hora de Panamá) el EMSC publicó un «M 4.0» en el golfo, a ~11 km de Juan Díaz (la web lo rotulaba «Cerca de Juan Díaz» por la localidad más cercana). A las 16:37 el cron lo envió como alerta a **29 198 dispositivos**. Lo traía **un solo catálogo** (el EMSC, con autor «UNA»); el IGC, que según nuestros datos no lo tenía, lo desmintió. Lo que sí se comprobó con los datos: la tabla del IGC no tiene ninguna fila a esa hora, el USGS no tiene nada en la zona y 87 s antes (21:24:21 UTC) hubo un M 4.8 a 162 km de profundidad en el norte de Colombia, así que parece una asociación falsa de las ondas de ese sismo lejano (una hipótesis, no un hecho). No se encontró un desmentido público del IGC: se basa en lo que informó quien administra el sitio.

**Por qué pudo pasar.** `lib/push-check.ts` avisaba cualquier sismo de M 3 o más de **cualquier** catálogo, también de uno solo. Los 12 sismos que solo trae el EMSC entre el 9 y el 13 de octubre son **todos de «UNA»** (de los 97 que UNA publicó en la región, 85 sí están en el IGC); los otros 11 caen en el Pacífico sur, no cerca de la capital. En las últimas 24 horas de registros de Vercel fue el único aviso nacido de un registro EMSC (los registros solo llegan a 24 h, no se pudo mirar antes).

**Qué cambió.**
- **Alertas.** Un sismo «sin confirmar» (el registro que queda tras fusionar los catálogos es del EMSC: ningún otro lo trae) **no se avisa** —ni push, ni sirena, ni notificación con la página abierta— mientras el IGC esté respondiendo. Cuando el IGC o el USGS lo publican, el registro fusionado ya no es «solo EMSC» y se avisa en ese momento, una sola vez (el id del EMSC queda como alias, así que no se repite).
- **Excepciones.** M **5.0 o más** se avisa aunque solo lo traiga el EMSC (un sismo así de grande no se puede dejar esperando), y si el **IGC no responde** en esa consulta se avisa como antes (no se puede saber si lo confirmaría y no se quieren perder alertas reales).
- **Qué se ve.** Sigue apareciendo en la lista, el mapa, la ficha y `/analisis` (los datos son los de los catálogos), pero con el rótulo **«Sin confirmar · solo EMSC»**; en la ficha dice que puede ser una detección errónea y, si es menor de M 5, que no se avisa por alerta hasta que alguien lo confirme.
- **El de Juan Díaz se retiró por completo.** `RETRACTED_EVENTS` en `lib/catalogs.ts` (`emsc:2074346`, con su motivo): como todo en la web sale de esa consulta, ya no aparece en el mapa, la lista, la ficha, `/analisis`, los conteos de réplicas ni los reportes «¿Lo sentiste?», ni se avisa. Es un retiro editorial de un sismo que la institución local desmintió; no se agrega ninguno sin una razón comprobable. Los otros 11 de solo EMSC se quedan (con su rótulo).
- **Dónde está.** `isUnconfirmed`, `awaitsConfirmation` y `UNCONFIRMED_ALERT_MAG` en `lib/earthquakes.ts`; `selectQuakesToPush` / `runQuakeCheck` en `lib/push-check.ts` (el cron y `/api/earthquakes` pasan si el IGC respondió); la retención de la alerta de la página en `app/page.tsx` (un sismo retenido tampoco se anota como «visto»: si no, cuando el IGC lo confirmara contaría como ya conocido y nunca sonaría).

**Cómo se probó.**
- 17 comprobaciones de la regla con el sismo real de ese día y casos de borde (M 4.9 y 5.0, sin magnitud, IGC caído, confirmado por el IGC o por el USGS, ya avisado, «de los alrededores», mezcla de varios): con el IGC activo no se habría avisado; con el IGC caído sí, como antes.
- Con los datos en vivo de ese momento: 12 sismos «sin confirmar» y ninguno con alias (tras retirar el de Juan Díaz, 11 y ninguno en la zona de la capital, ni en la consulta de Panamá ni en la de los alrededores); simulando las 16:37 del 13 de octubre, la regla no habría enviado el aviso del EMSC.
- En el navegador (servidor local, respuesta de `/api/earthquakes` sustituida solo en esa pestaña; no se llamó a ningún endpoint de push): un sismo nuevo solo-EMSC **no** muestra la alerta de la página; al llegar el mismo sismo confirmado por el IGC (con el id del EMSC como alias) la alerta aparece una sola vez; con el IGC simulado como caído, el solo-EMSC sí alerta. La lista muestra 12 rótulos, la ficha y el globo del mapa su insignia, `/analisis` «· sin confirmar» en la tabla. axe: sin violaciones nuevas (dos que ya existían en la portada: `.now-stats` y `.now-side`).

**Estado: publicado y verificado en producción (13 de octubre de 2026).** Commit `9ac2768` en `main`, despliegue de Vercel listo en `www.ojopanama.com`. Comprobado en vivo después de publicar: la API (`/api/earthquakes`) ya no devuelve `emsc:2074346` (519 eventos); la portada no tiene ninguna fila de M 4.0 cerca de Juan Díaz y muestra **11** rótulos «Sin confirmar · solo EMSC» (antes 12). Antes, el mismo día, se había publicado el commit `4b64d5d` (pantalla completa de la línea de tiempo, optimización de `/analisis` y arreglo del aviso «Nuevo sismo»; ver «📊 Gráficas interactivas y animadas»).

**Aclaración pública en la portada.** Se publicó un aviso azul arriba de «Sismos en Panamá» (`app/clarification-notice.tsx` y `.css`, montado en `app/page.tsx`) con este texto:

> **Aclaración sobre el sismo de Juan Díaz (13 de octubre).** A las 4:37 p. m. enviamos una alerta por un sismo de M 4.0 cerca de Juan Díaz. Ese registro lo publicó el **EMSC** (Centro Sismológico Euromediterráneo), un centro sismológico internacional y una de las fuentes oficiales que contrastamos junto con el IGC-UP y el USGS. **Esta vez el EMSC se equivocó:** el IGC-UP indicó que no fue un sismo real y el USGS tampoco lo registró. Ya lo quitamos del mapa y de las cifras. Para que no se repita, desde ahora un sismo que solo publica un catálogo no genera alertas hasta que otro lo confirme (salvo los de M 5 o más). Lamentamos la confusión.

- **Cuánto dura.** Se ve hasta el **21 de octubre de 2026 (00:00, hora de Panamá)**, o hasta que la persona pulse «Entendido»: queda cerrado en su dispositivo (`localStorage`, clave `clar-juan-diaz-2026-10-13`). Para quitarlo antes de esa fecha, borrar la línea `<ClarificationNotice />` de `app/page.tsx`; para alargarlo, cambiar `EXPIRES`.
- **Qué dice y qué no.** «El IGC-UP indicó que no fue un sismo real» lo informó quien administra el sitio; no se encontró un comunicado público del IGC-UP que se pueda enlazar (si lo hay, conviene agregarle el enlace). Lo que sí se comprobó con los datos: el IGC-UP y el USGS no lo registran. «Fuente oficial» sigue el mismo criterio del resto de la web (que presenta los datos del IGC-UP, el USGS y el EMSC como datos oficiales); el EMSC es una asociación científica internacional sin fines de lucro, no una agencia de gobierno, y el registro concreto lo aportó una agencia contribuyente («UNA»).
- **Qué NO se hizo.** No se envió ninguna notificación push de aclaración a los suscriptores: esa acción llega a decenas de miles de teléfonos y solo se haría con una orden explícita de enviarla.
- **Cómo se probó** (servidor local): aparece arriba de la portada, el botón «Entendido» lo cierra y no vuelve a salir al recargar, al pasar la fecha de caducidad (simulada) desaparece, se ve bien en tema claro y oscuro, y axe no da violaciones nuevas (las dos de siempre: `.now-stats` y `.now-side`). Es una `<section>` con título, no un `<aside>`, para no repetir el aviso de «región complementaria anidada».

**Cómo retirar otro sismo desmentido.** Agregar su id (por ejemplo `emsc:2074346`, `igc:1791926496` o el del USGS) al conjunto `RETRACTED_EVENTS` de `lib/catalogs.ts`, con un comentario que diga qué institución lo desmintió y qué datos lo respaldan; hoy el filtro se aplica a los registros del EMSC (`fetchEmsc`), que es de donde vino este. Después de publicar, la API tarda hasta ~2 minutos en renovar su caché (30 s en el borde más 90 s de reserva). Los dispositivos que ya tienen la página abierta lo dejan de ver al actualizar. **No se puede deshacer un aviso ya enviado.** Si hiciera falta una aclaración a los suscriptores, hay que decidirla y enviarla aparte; esta vez no se envió ninguna.

**Lo que no se hizo ni se sabe.**
- **No se puede retirar** una alerta ya enviada, y no se mandó ninguna aclaración a los suscriptores.
- Los otros 11 sismos de solo EMSC **siguen contando como réplicas** en los conteos de la página (el de Juan Díaz ya no); no se tocaron los conteos por esos 11.
- No se sabe cuántos de los 11 anteriores del 9 al 12 de octubre llegaron a avisarse (registros fuera de las 24 h).
- Una alerta de un sismo real que el EMSC publique antes que el IGC sufrirá el retraso que tarde el IGC en listarlo (el IGC suele listar en 1–5 min; 4 min en el ejemplo del IGC de las 16:21).
- El retiro por `RETRACTED_EVENTS` solo filtra registros del EMSC; si algún día hubiera que retirar uno del IGC o del USGS, habría que aplicar el mismo filtro en sus consultas.
- Aviso de accesibilidad previo a esto y sin resolver: en la portada `.now-stats` (lista de definiciones) y `.now-side` (región complementaria) tienen cada uno una violación de axe que ya existía.

---

## 🛡️ Seguridad y Buenas Prácticas (OWASP Top 10)

- **Anti-SSRF:** Validación estricta de endpoints push con lista blanca de proveedores oficiales (`fcm.googleapis.com`, `push.apple.com`, `mozilla`, `windows`).
- **Anti-Cache Busting:** Rechazo automático de parámetros maliciosos de consulta.
- **Row Level Security (RLS):** Bloqueo total de acceso de lectura a usuarios anónimos en la base de datos de suscripciones.
- **Cabeceras de Endurecimiento:** HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, y `Permissions-Policy` restrictiva.

---

## 📄 Licencia

Este proyecto es de código abierto bajo la licencia [MIT](LICENSE).

---

## 👤 Creador

Desarrollado con dedicación para Panamá por **Humberto Antonio**.
- Instagram: [@humbertiex_](https://www.instagram.com/humbertiex_)
- GitHub: [@Humbertoo28](https://github.com/Humbertoo28)
