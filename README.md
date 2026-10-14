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
- **Notificación push de aclaración (enviada).** Con la orden explícita de quien administra el sitio («manda la notificación a todos… sin sirenas») se envió **una sola vez, el 13 de octubre de 2026 a las 8:57 p. m. (hora de Panamá)**, esta notificación:

  > **Aclaración · sismo de Juan Díaz** — La alerta de las 4:37 p. m. (M 4.0 cerca de Juan Díaz) fue un error del EMSC, una de las fuentes oficiales que usamos: el IGC-UP indicó que no fue un sismo real. Ya la retiramos. Toca para ver la aclaración.

  Resultado (registro de Vercel): **29 779 destinatarios, 29 729 aceptados** por Google, Apple, Mozilla y Windows, 50 rechazados (45 suscripciones caducadas, dadas de baja como siempre), **0 sin enviar** por tiempo. Al tocarla abre la portada, donde está el aviso azul.
  - **Sin sirena ni voz.** La sirena y la voz solo suenan cuando el service worker (`public/sw.js`) avisa a la página de un sismo real, y eso exige una magnitud en el mensaje. Esta no lleva magnitud y su id empieza por `anuncio-`, que el service worker excluye siempre. En el teléfono suena y vibra como cualquier notificación normal (una notificación web no puede reproducir la sirena propia).
  - **A quién.** A quienes recibieron la alerta falsa: suscripciones con magnitud mínima de **4.0 o menos** (la alerta fue de M 4.0). **No** se envió a quienes eligieron una magnitud mínima mayor (nunca recibieron esa alerta; una aclaración les habría llegado sin contexto). Si se quisiera enviar también a ellos, habría que hacerlo aparte.
  - **Cómo se envió.** Desde el servidor de producción, con el cron de cada minuto, y no desde un computador: parte de los dispositivos (7 818 de 29 779) usa la clave de envío «v2», que solo existe en las variables de Vercel. Antes de enviar se reservaba una fila en `notified_quakes` (misma técnica que las alertas), así que no podía repetirse aunque se cruzaran dos ejecuciones, y fuera de producción no enviaba nada. Se probó antes con una base y un envío simulados (16 comprobaciones: solo envía en producción, envía una sola vez aunque se crucen dos ejecuciones, se libera la reserva si cae el servicio de push y el mensaje no lleva magnitud). **Ese código se retiró de inmediato** (`lib/clarification-push.ts` y su llamada en el cron) para que no pueda volver a dispararse; quedó en el commit `92dc970` del historial de git.
  - **Lo que no se verificó:** que cada persona la vea y cómo (cada sistema decide el sonido, el orden y cuánto tiempo queda en pantalla); «aceptado» significa que el servicio de push la recibió, no que el teléfono la mostró.
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

## ⚡ Lista de sismos: la página se «caía» al tocar «Mayor magnitud»

**Reporte (14 de octubre de 2026).** «Cuando alguien toca *Mayor magnitud*, se cae la página.» Ese botón ordena la lista «Sismos registrados» (`app/page.tsx`).

**Lo que se encontró.**
- **Una captura de un iPhone confirmó que es una caída real.** Se recibió una captura del navegador integrado de **Instagram** en un iPhone con la pantalla en negro y el texto «Ocurrió un problema varias veces en https://www.ojopanama.com/#eventos». Ese mensaje de WebKit sale cuando el proceso que dibuja la página se cierra (casi siempre porque el sistema se queda sin memoria) y vuelve a cerrarse al recargarla. Un navegador integrado tiene menos memoria que Safari, y a la web llega mucha gente desde Instagram. Lo que no se sabe es el modelo del iPhone ni la versión de iOS.
- **No se pudo reproducir la caída en una computadora** (la falla es de un proceso de iPhone que el sistema cierra, y una computadora tiene mucha más memoria). Se probó en la web publicada, en ventana de escritorio y de teléfono (375 px): ordenar, volver, 12 cambios seguidos, con «Incluir alrededores», con «Solo réplicas», con la ficha abierta y eligiendo una fila después de ordenar. Sin errores en la consola ni pantalla de error; no hay ids repetidos ni magnitudes vacías en los datos.
- **Sí se midió una página que se congela.** La lista dibujaba **todos** los sismos (540 filas, 7 546 elementos en la página) y cada cambio de orden los volvía a dibujar: en una computadora rápida tardaba entre **0.3 y 1.2 s** (promedio ~380–435 ms) por cambio. El costo crece con las filas (540 filas ≈ 200–400 ms; 343 ≈ 177 ms; 27 ≈ 28 ms) y la lista crece con cada réplica. En un teléfono de gama media o baja eso multiplica varias veces: varios segundos con la página sin responder, que desde fuera parece «caída». **Es la causa más probable, pero no se confirmó en un teléfono real.** Quitar las animaciones (`content-visibility`, «Reducir animaciones») casi no ayudaba: el costo estaba en dibujar tantas filas, no en animarlas.

**Qué cambió.** Solo se dibujan las primeras **60 filas**; al final de la lista hay un botón **«Mostrar más sismos · quedan N»** que agrega 120 cada vez. El orden se calcula sobre todos los sismos (las 60 de «Mayor magnitud» son las 60 mayores de verdad) y al cambiar de orden la lista vuelve a 60. Los conteos de arriba («538 réplicas + 1 sismo principal…»), el mapa y los filtros no cambian: solo cambia cuántas filas se dibujan. Constante `ROW_PAGE` en `app/page.tsx`.

**Resultado** (compilación de producción local en ventana de teléfono, misma computadora y mismo panel que la medición de «antes», que se hizo en la web publicada): cambio de orden **43 ms de promedio (máximo 60 ms)** frente a ~380–435 ms antes; elementos en la página **7 546 → 2 837**. La carga inicial de la portada también dibuja menos.

**Cómo se probó.** Orden correcto con las 540 filas (las 60 primeras de «Mayor magnitud» van de 7.7 a 6.0 sin subir, y la lista completa también), «Mostrar más» (60 → 180 → … → 540, el botón desaparece al llegar al final y el contador baja bien), volver a «Recientes» (vuelve a 60), elegir una fila (se abre la ficha y queda marcada) y sin errores en la consola. No se ejecutó axe en esta compilación.

**Lo que no se sabe ni se probó.** Un teléfono real (ni Safari ni Firefox); si esto era de verdad el origen de la caída. Si vuelve a pasar: modelo de teléfono, navegador y qué se ve (pantalla blanca, mensaje de error, se reinicia o se queda congelada) para buscar otra causa. El texto «quedan N» y los botones leen bien con lectores de pantalla, pero la lista sigue siendo una región `aria-live` y puede anunciar las filas nuevas al pulsar «Mostrar más».

---

## 🕰️ Historia sísmica (`/historia`): explorador interactivo, solo con datos reales

**Pedido (14 de octubre de 2026):** «el lado de historia mejóralo, que todo lo que pongas sea verídico y cosas interactivas».

**Regla de la página.** Todo sale del catálogo **ComCat del USGS** (sismos de M 6 o más en Panamá desde 1900: **94**, de ellos 6 de M 7 o más y los 4 de la secuencia de 2026). Lo que se muestra son esos registros, conteos, fechas y distancias calculadas con las posiciones que publica el USGS. **No hay estimaciones, pronósticos, textos generados ni cifras de otras fuentes sin citar.** No hay historia contada de memoria: lo que no viene del catálogo del USGS solo entra como «dato curioso» con su fuente, leído en vivo de la base oficial de NOAA y comprobado contra su texto actual (ver más abajo).

**Qué se puede hacer ahora** (`app/historia/explorer.tsx`, `explorer.css`, `frame.ts`):
- **Mapa interactivo** con los 94 sismos: tocar o pasar el cursor por un círculo (se elige el más cercano al dedo, no hace falta acertar), **acercar y alejar** (hasta ×8) con botones o con `+` y `−`, **arrastrar** para moverlo, y ciudades de referencia (la capital y las capitales de provincia, de GeoNames).
- **Línea de tiempo** (año × magnitud) enlazada con el mapa: elegir un punto en cualquiera de los dos lo elige en ambos.
- **Reproducir la historia** año por año (4 a 14 s según el tramo), con pausa y un deslizador «Hasta el año…» para recorrerla a mano; los sismos aparecen en su orden real.
- **Magnitud mínima** (6.0+, 6.5+, 7.0+) y **década** como filtro: elegir una década (o quitarla) cambia mapa, línea de tiempo y tabla.
- **Detalle de cada sismo**: magnitud y su tipo (Mw, Mww, Ms…), fecha y hora universal, lugar traducido del USGS, profundidad, posición publicada, puesto por magnitud entre los 94, enlace a su página en el **USGS**, y comparación con el de 2026: **años cumplidos** antes, diferencia de magnitud, **distancia entre epicentros** y cuántos sismos de la lista caen a 100 km; si hubo otros el mismo día, botones para saltar a ellos. Anterior/Siguiente en el tiempo, flechas del teclado, y **«Copiar enlace»** (`#sismo=<id>`: el enlace abre la página ya posicionada en ese sismo).
- **Tabla completa** (los 94, no solo 12) ordenable por magnitud, más recientes o más antiguos, con «Mostrar más sismos» (12 al inicio, +24).
- **Los de M 7 o más, uno tras otro**: los años entre cada par seguido (de 1 a 50), con la advertencia de que no sirven para predecir.
- Se mantuvo el mapa de «Los 12 más grandes» (con su acercamiento al suroeste) y los datos de la sección «Lo que dicen los registros». **Ese mapa ahora es interactivo** (pedido del 14 de octubre de 2026: «que los 12 más grandes salgan en un mapa interactivo»; `app/historia/top-map.tsx`, `top-map.css`, `selection.ts`): ver abajo.
- Se quitó el mapa fijo anterior (`history-map.tsx`) y la tabla de 12 filas, que el explorador reemplaza.

**Mapa interactivo de los 12 más grandes (pedido del 14 de octubre de 2026).** Cada número del mapa (y del acercamiento al suroeste) es un botón: tocarlo, o pulsar Enter o espacio con el teclado, abre debajo del mapa la **ficha de ese sismo** con los mismos datos del catálogo del USGS que el resto de la página: magnitud y su tipo, fecha y hora universal, lugar traducido, **puesto por magnitud (de 94)**, profundidad y provincia o comarca (o «Mar frente a …»). Tocar el mismo número otra vez la cierra.
- **Teclado:** Tab llega al mapa; las flechas pasan al puesto anterior o siguiente (el foco se mueve con ellas) y Inicio / Fin van al 1.º y al 12.º.
- **«Puesto anterior» / «Puesto siguiente»** recorren los 12 en orden de magnitud, y **«Ver ficha completa ↑»** elige ese sismo en el explorador de arriba (`#sismo=<id>`, el mismo enlace compartible) y lleva la vista hasta él.
- **En el teléfono:** la ficha queda debajo de los mapas, así que al tocar un número la página se desplaza lo mínimo para mostrarla (con «reducir animaciones» no se desliza). Cada número visible mide unos 21 px en pantalla de 375 px, así que se le añadió un área para tocar **invisible** de unos 30 px (el hueco entre números del acercamiento es de 44 unidades, y el área no los pisa).
- **Vista satelital del mapa de los 12 (pedido del 14 de octubre de 2026: «que también sea satelital»).** Un selector **Vista: Plano · Satélite** sobre el mapa (empieza en «Plano»). En «Satélite», tanto el mapa general como el acercamiento al suroeste se dibujan sobre la imagen de **Esri World Imagery** (los mismos mosaicos del explorador, del mapa en vivo y del 3D), con la atribución «Imagen © Esri, Maxar, Earthstar Geographics» debajo. Las imágenes **no se piden hasta que se elige «Satélite»**: la página no pesa más para quien no la usa. El acercamiento pide más detalle que el general (mosaicos de zoom 10 contra 7 y 8) y, como el contorno simplificado del país no coincide con la costa de esa imagen vista de cerca, **ahí se omite el contorno**; el mapa general lo conserva como línea. La cuadrícula y los números se ven sobre la imagen (números con borde claro y sombra).
- **Código compartido:** la imagen satelital salió de `explorer.tsx` a `app/historia/sat-tiles.tsx` (`SatTiles` recibe el recuadro de latitudes y longitudes que cubre y la parte que se ve), y la usan el explorador y el mapa de los 12. Se comprobó que el explorador no cambió: 30 mosaicos (zoom 7 y 8), las 13 provincias y, al acercar al tope, mosaicos de zoom 11.
- La página sigue generándose en el servidor con el mapa ya dibujado; la parte interactiva es solo la selección y la vista. No agrega ninguna fuente de datos de sismos: todo sale del catálogo del USGS ya cargado.
- **Cómo se probó:** en desarrollo y en la compilación de producción: 12 números (6 en el mapa y 6 en el acercamiento), elegir con clic real, con Enter y espacio, flechas (2 → 3, Fin → 12), cerrar con el mismo número, los botones anterior y siguiente (con el siguiente desactivado en el 12.º), «Ver ficha completa» elige el sismo en el explorador y hace `#sismo=us6000u18k`, y en ventana de teléfono la ficha queda a la vista tras tocar y no hay desborde horizontal. axe (incluida la regla de tamaño de objetivo de WCAG 2.2): **0 violaciones** en teléfono y escritorio, en claro y oscuro, con la ficha abierta y cerrada, y también en teléfono con la vista satelital. Satélite: 57 de 57 mosaicos cargan (30 en el mapa general y 27 en el acercamiento), en desarrollo y en la compilación de producción con su política de seguridad (sin bloqueos de la política). Sin errores propios en la consola.
- **No se probó** un teléfono real ni el navegador de Instagram en iPhone (pedir 57 imágenes más es lo que habría que vigilar si alguien reporta una caída; solo ocurre al elegir «Satélite»). El mapa de los 12 no tiene zoom propio (para eso está el explorador); su acercamiento al suroeste sigue siendo fijo. Si el explorador y el mapa de los 12 están los dos en «Satélite», la página tiene hasta unos 90 mosaicos cargados.

**Vistas satelital y 3D (pedido del 14 de octubre de 2026: «puedes crear ese mapa en 3D y en vista satélite»).** Un selector **Vista: Plano · Satélite · 3D** sobre el mapa de la historia. Los filtros (magnitud, décadas), el deslizador de años, la reproducción y el sismo elegido valen en las tres vistas.
- **Satélite** (`SatTiles` en `app/historia/explorer.tsx`): imagen **Esri World Imagery**, los mismos mosaicos del mapa en vivo y del 3D, debajo de los círculos. Hay siempre una capa de fondo (9 mosaicos) y, al acercar, otra con más detalle (hasta 30 mosaicos, zoom 8 a 11, según el ancho en pantalla). Cada mosaico se coloca entre sus dos longitudes y dos latitudes en el mapa plano (a esta escala la deformación de Mercator dentro de un mosaico es de una fracción de píxel). El contorno del país (simplificado) solo se dibuja al ver todo; al acercar se quita porque la propia imagen muestra la costa y el contorno se vería desalineado. Atribución visible: «Imagen © Esri, Maxar, Earthstar Geographics». Se acerca hasta ×8 y se arrastra igual que el plano.
- **3D:** la **misma escena 3D del sitio** (`app/quake-3d.tsx`): superficie con imagen satelital de Esri y relieve de AWS Terrain Tiles (SRTM y otras fuentes públicas), cada sismo a su profundidad, giro con arrastre, zoom, «Perspectiva / Arriba / Lado», ajustes de escala vertical y pantalla completa (Escape la cierra). Los sismos del historial se le pasan con la misma forma que los del catálogo en vivo, con la profundidad que publica el USGS. Se baja **solo al elegir «3D»** (no pesa en la carga de la página). Se añadieron dos capas con datos estáticos ya usados en el sitio: «Placas tectónicas» (PB2002, P. Bird 2003; aproximadas) y «Fallas activas» (centro del país; CCAF-DB/GEM). Elegir un sismo en el 3D lo elige en toda la página.
- **Corregido después de subirlo (14 de octubre de 2026): «si solo son 94 sismos, ¿cómo que réplicas?».** La escena 3D de la portada trae un interruptor «Réplicas: Sí / No» (en «Ajustes y capas») que, en la historia, trataba como «réplicas» todo lo posterior al sismo de 2026 y, al pulsar «No», ocultaba también **todos los anteriores**: quedaban 2 de los 94 (se comprobó en producción). La historia no es una secuencia, son 94 sismos de 122 años, así que ahora la escena recibe `aftershockToggle={false}` y ese interruptor no aparece ahí (en la portada sigue igual). Se comprobó: 94 sismos, sin interruptor y sin la palabra «réplica» en el 3D de la historia.
- **Lo que se corrigió para que fuera veraz:** la escena 3D redondeaba la magnitud a un decimal y un sismo de **6.96 se rotulaba «M 7.0»**; ahora muestra la precisión publicada (6.96, 6.53…) y las magnitudes de un decimal se ven igual que antes. La escena 3D da las horas en **hora de Panamá** y el resto de la página en **hora universal**: el aviso está escrito bajo el mapa. Y las profundidades: **62 de los 94 sismos** tienen una profundidad exacta en múltiplos de 5 km (23 de ellos, exactamente 10 km); es habitual que el catálogo use un valor fijo cuando no logra calcularla, así que la altura en 3D es aproximada (la escena dibuja tenues los de 10 y 5 km; el texto bajo el mapa cuenta cuántos de los que se ven son múltiplos de 5).

**Provincias y comarcas en el mapa (pedido del 14 de octubre de 2026: «que se vean todas las provincias»).** Un botón **«Provincias»** (encendido por defecto, en el grupo «Capas del mapa»; no aparece en 3D) dibuja el límite y el nombre de las **13 divisiones**: Bocas del Toro, Chiriquí, Coclé, Colón, Darién, Herrera, Los Santos, Panamá, Panamá Oeste y Veraguas, y las comarcas **Emberá-Wounaan, Guna Yala y Ngäbe-Buglé** (en cursiva y con línea de trazos). Sobre la imagen satelital quedan como líneas blancas; en el mapa plano, como áreas azules. Los límites son los de **geoBoundaries** (gbOpen, nivel ADM1, de OpenStreetMap, licencia **ODbL**), simplificados a unos 900 m, y la atribución «Límites: geoBoundaries © OpenStreetMap (ODbL)» se ve bajo el mapa (en el teléfono, en una franja debajo para no tapar el mapa). Los nombres de ciudades se muestran al acercar. La ficha de cada sismo dice en qué provincia o comarca cae (o «Mar frente a …»). Cuatro rótulos se fijaron a mano para que no se pisaran (Panamá, Guna Yala, Emberá-Wounaan —en dos líneas— y Darién): se comprobó que los 13 caen dentro de su territorio y, en ventana de teléfono, que ninguno queda fuera del marco.

**«Datos curiosos» por sismo, cada uno con su fuente (pedido del 14 de octubre de 2026: «datos curiosos por sismo, pero que sean full verídicos y siempre confirma la fuente»).** Al elegir un sismo, la ficha muestra una lista; **cada dato trae «Fuente:» con un enlace** y de qué tipo es:
- **NOAA NCEI** (base de datos mundial de sismos significativos, doi:10.7289/V5TD9V7K, y base histórica de tsunamis, doi:10.7289/V5PN93H7): magnitud que anota NOAA comparada con la del USGS (dice «coincide» o «no publican la misma cifra», y la diferencia de profundidad), intensidad máxima, muertos, heridos, daños en millones de dólares, viviendas, si NOAA lo vincula con un tsunami, qué tan seguro lo considera y la altura máxima del agua. Cada dato lleva el enlace al registro y a «datos originales» (la API de NOAA). Se piden en vivo cada media hora (ISR), **nunca se guardan copias en el código**. Un registro de NOAA solo se une a un sismo del USGS si coinciden en **hora (hasta 20 min) y en lugar (hasta 200 km)**: hoy se unen **14 de los 94**, todos con menos de 1 minuto de diferencia en la hora (el más lejano, a 80 km). Los que no tienen pareja no se rellenan: por ejemplo, NOAA lista un sismo del 20 de diciembre de 1904 en Bocas del Toro que el catálogo del USGS de esta lista no trae, y la lista del USGS tiene uno del 20 de enero de 1904 en otro lugar; **no se unen**. Solo se toman campos con nombre y unidad conocidos (los códigos de «orden de magnitud» de NOAA no se muestran), y se muestran solo cifras que NOAA publica de forma explícita para **ese** evento.
- **Frases textuales de NOAA** (por ejemplo, las boyas de Puerto Armuelles en 1934): cada una se escribe en español **y** se muestra la frase original en inglés en un desplegable («Texto original de la fuente»). Antes de mostrarla, el servidor **comprueba que esa frase exista tal cual en el texto actual de NOAA**: si NOAA la cambió o la quitó, esa curiosidad no se muestra. Hoy se comprobaron **11 frases: 11 encontradas, 0 no encontradas**.
- **USGS** (página del propio sismo): si tiene **ShakeMap**, su intensidad máxima estimada (escala Mercalli modificada), y si tiene «¿Lo sentiste?», cuántas personas enviaron reportes y la intensidad máxima de esos reportes. Se dicen con esas palabras porque son lo que el catálogo trae en esos campos; la nota aclara que el ShakeMap es una estimación del modelo, no una medición.
- **Calculado aquí** con las fechas y posiciones del catálogo (se puede rehacer con la tabla): puesto por magnitud en su década, tiempo desde el sismo anterior de la lista, cuántos hubo ese año, el de la lista con la posición más cercana, el orden entre los de M 7 o más y la distancia a Ciudad de Panamá (punto de la ciudad en GeoNames). Cada uno dice «Calculado aquí…» y enlaza a la consulta del USGS de la que salen los datos.
- **Si no hay dato, no se inventa uno:** un sismo sin registro en NOAA ni ShakeMap muestra solo los calculados. La nota al pie dice cuándo se consultó NOAA, o «NOAA no respondió» (la página sigue con el USGS). El sismo del 9 de octubre de 2026 es reciente y NOAA puede corregir su registro: por eso se lee en vivo y las frases se comprueban cada vez.

**¿Qué es NOAA y por qué se usa aquí?** NOAA es la Administración Nacional Oceánica y Atmosférica de Estados Unidos, una agencia del gobierno de ese país. De ella se usa el **NCEI** (Centros Nacionales de Información Ambiental, antes NGDC), que mantiene dos bases de datos públicas:
- **Sismos significativos** (desde el año 2150 a. C.): cada registro trae magnitud, profundidad, intensidad, muertos, heridos y daños. Un sismo entra cuando causó daños importantes, dejó muertos o provocó un tsunami; **no es un catálogo en tiempo real** como el del USGS.
- **Tsunamis históricos:** si hubo tsunami, qué tan seguro es y la altura máxima del agua; algunos registros traen observaciones de testigos.

El USGS da la física del sismo (dónde, cuándo y qué tan grande); NOAA agrega lo que pasó después (heridos, daños, olas). Por eso **nunca se mezclan sin avisar**: cada dato dice de qué base sale y enlaza a su registro. Y los dos catálogos a veces no coinciden (en 1934 NOAA anota Ms 7.7 y el USGS Mw 7.5, que son escalas distintas): se muestran las dos cifras tal cual, sin promediar ni corregir.

**En producción (14 de octubre de 2026).** `ad549fa` (explorador) y `2a9904c` (capital) ya estaban; `b4fc70a` subió satélite, 3D, provincias y datos curiosos; `877e90e` quitó el interruptor «Réplicas» del 3D de la historia. Se comprobó en `www.ojopanama.com/historia` (despliegues de Vercel en READY): 13 provincias dibujadas, 30 mosaicos, 12 datos curiosos en el sismo de 1934 (5 de NOAA), la nota «consultadas el 14 de octubre de 2026» y, en el 3D, 94 sismos sin interruptor de réplicas.

**Cómo se calcula cada cifra** (para que se pueda comprobar):
- *Años:* años cumplidos entre las dos fechas completas (en hora universal). Del 20 de enero de 1904 al 9 de octubre de 2026 son 122.
- *Distancia entre epicentros:* fórmula de la distancia sobre la esfera (la misma `kmBetween` del resto del sitio) entre las posiciones publicadas. Es una distancia calculada, no medida; las posiciones de los sismos antiguos son reconstrucciones del USGS y tienen más incertidumbre (la página lo dice).
- *«A 100 km»:* cuántos sismos **de esta misma lista** (contando el propio) quedan a 100 km o menos de su posición publicada.
- *Puesto:* orden por magnitud entre los 94; a igual magnitud, primero el más reciente.
- *Intervalos de M 7:* años cumplidos entre un sismo de M 7 o más y el siguiente de la lista.
- *Ciudades del mapa:* coordenadas de GeoNames (CC BY 4.0); la capital se toma de su propia ficha (id 3703443: 8.9936° N, 79.5197° O), verificada contra una segunda fuente que cita GeoNames.

**Cómo se probó.**
- **30 comprobaciones de las funciones** (`lib/history.ts`: décadas, filtros, años cumplidos en los bordes de aniversario, puestos, mismo día, distancias, intervalos de M 7, enlaces del USGS) contra los datos reales: pasan. Tres de las cifras que muestra la ficha se recalcularon aparte con otro programa: 194 km entre el sismo de 1934 y el de 2026, 5 sismos a 100 km del de 2026 y 44 a 100 km del de 1934.
- **En el navegador** (servidor de desarrollo y compilación de producción con su política de seguridad): elegir con clic real, con el teclado (flechas) y desde la tabla; reproducir, pausar y llegar al final (94 sismos de 1904 a 2026); filtros de magnitud (94, 29 y 6 sismos) y de década (1930: 10; 2020: 12); acercar hasta el tope, arrastrar, «Acercar en el mapa»; ordenar y «Mostrar más»; abrir un enlace `#sismo=…` en una pestaña nueva; en ventana de teléfono (375 px) sin desborde horizontal y con círculos agrandados para verse y tocarse. Sin errores en la consola. La página completa tiene unos 900 elementos (la portada pasaba de 7 000).
- **Provincias y datos curiosos:** en desarrollo y en la compilación de producción con su política de seguridad (`img-src` ya permitía los mosaicos de Esri): las **13 divisiones** dibujan su límite y su nombre en satélite y en plano (claro y oscuro); los 30 mosaicos cargan; el sismo de 1934 (M 7.5) muestra **12 datos curiosos** y el de 2026 (M 7.7), 13, todos con enlace de fuente (0 enlaces que no sean https); un sismo sin NOAA (M 6.83 de 1934) muestra 6, calculados y de USGS. Se comprobó contra NOAA con un programa aparte: **14 uniones, 11 frases textuales encontradas, 0 faltantes**. En ventana de teléfono (375 px) se corrigieron tres defectos que aparecieron al probar: «Panamá» y «Guna Yala» se pisaban, «Emberá-Wounaan» se cortaba en el borde del mapa y la atribución tapaba la parte baja del mapa. axe: **0 violaciones** en teléfono con el mapa satelital y en escritorio con el mapa plano, en tema claro y en oscuro (con los desplegables abiertos). `tsc` y `eslint` sin errores.
- **Vistas satelital y 3D:** en el servidor de desarrollo y en la compilación de producción con su política de seguridad: los mosaicos cargan (8 de 8 comprobados), la escena 3D carga sin errores en la consola, la reproducción mueve el 3D (4 → 21 → 37 → 50 sismos al avanzar los años), elegir un marcador del 3D con un clic real elige ese sismo en la página (se probó con el de 1943, «M 6.96»), el zoom y el arrastre en satélite piden mosaicos más finos (de zoom 7 a 10 al acercar a Azuero), la pantalla completa del 3D llena la ventana (375×812) y Escape la cierra y devuelve el desplazamiento, y en ventana de teléfono no hay desborde horizontal. axe: **0 violaciones** en teléfono con satélite y con 3D, en claro y oscuro. **Accesibilidad:** axe-core 4.11 con **0 violaciones** en teléfono, en tema claro y en tema oscuro (con las transiciones apagadas: con el panel de pruebas oculto, las transiciones de color se quedan a medias y dan falsos contrastes). Se corrigió de paso el **tema oscuro de toda la página**, que ya estaba mal: la lista «Lo que dicen los registros», la fila del sismo de 2026, las leyendas y los botones del final usaban colores claros fijos y eran ilegibles en oscuro (contraste de 1.4 a 1.5). «Reducir animaciones» deja las animaciones sin efecto.

**Lo que no se probó o no hace.** En la leyenda del 3D, el punto del sismo de 2026 (M 7.7) se llama «Principal»: es el mayor y el principal de la secuencia de 2026, pero en una historia de 122 años puede leerse raro (se puede cambiar a «El mayor»). La redacción de las frases de NOAA del sismo de 2026 puede cambiar con el tiempo (si cambia, la frase se oculta sola). No se probó un teléfono real ni el navegador de Instagram con las provincias y los datos curiosos nuevos (el trabajo extra es un SVG de 13 trazados y texto). Un teléfono real, el navegador integrado de Instagram en iPhone (ahí ya hubo una caída por memoria: el satélite pide hasta 30 imágenes y el 3D usa un lienzo grande, por eso el 3D solo se carga al elegirlo, pero **no se probó en un iPhone**), Safari y Firefox, VoiceOver y TalkBack. El 3D se maneja con ratón, dedos o teclado como el del resto del sitio; el mapa satelital plano no tiene zoom con dos dedos. No hay zoom con dos dedos (se acerca con los botones, y el mapa se mueve arrastrando). El orden de lectura con lector de pantalla del mapa es por la tabla y las flechas, no círculo por círculo. La página se actualiza cada media hora (la caché del USGS).

**Corregido de paso: «Distancia a Ciudad de Panamá» en la ficha de cada sismo.** La ficha de la portada (`lib/quake-facts.ts`) medía la distancia a la capital, y el tiempo de llegada de la sacudida, desde el **centro del distrito** de Panamá de GeoNames (9.244° N, 79.427° O), que queda a unos **30 km** al norte del centro de la ciudad (8.9936° N, 79.5197° O). Ahora usa el punto de la propia ciudad (`PANAMA_CITY` en `lib/places.ts`, GeoNames id 3703443, verificado con una segunda fuente que cita GeoNames), el mismo que usa el mapa de historia. Efecto: para el sismo principal de 2026 (7.59° N, 80.77° O) la ficha pasa de **236 km a 208 km** (comprobado con un cálculo aparte) y los tiempos de llegada a la capital se ajustan en proporción. El punto del distrito se sigue usando solo para ubicar el distrito (filtro por ciudad, localidad más cercana).

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
