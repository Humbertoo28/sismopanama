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
| **Línea de tiempo** (`/analisis`) | Los puntos entran en orden cronológico (~0.9 s), crecen al pasar el cursor, hay una cruz punteada que sigue al cursor y los sismos nuevos llevan un aro que se expande 3 veces. **Acercar, alejar y desplazar** la ventana de tiempo con botones, arrastrando (si está acercada) o con Ctrl/⌘ + rueda (la rueda normal sigue haciendo scroll); ventana mínima de 5 min; la transición es suave y solo se dibujan los puntos de la ventana. **Reproducir secuencia**: los sismos aparecen uno a uno con su lectura (magnitud, lugar, día y hora) y una onda; dura entre 5 y 18 s (505 sismos: 18 s), con *Pausar / Seguir / Reiniciar / Salir*. El eje de magnitud no se mueve al acercar ni al reproducir. |
| **Actividad** (barras y acumulado) | Las barras crecen y el área acumulada se dibuja al cargar o cambiar de gráfico. **Elegir un intervalo** (clic, o flechas + Enter con el teclado) lo resalta, acerca la línea de tiempo a ese tramo y filtra la tabla. |
| **Magnitudes y Profundidad** | Las barras crecen y los números cuentan cuando la gráfica llega a la pantalla. Cada fila es un botón: al elegirla se resaltan esos sismos en la línea de tiempo (los demás se apagan) y la tabla muestra solo esos. |
| **Indicadores** | Los números cuentan hacia su valor y las tarjetas entran escalonadas. |
| **Detalle del sismo** | Botones *Anterior / Siguiente* para recorrer los sismos en el tiempo, dentro de lo que esté seleccionado; si queda fuera de la ventana acercada, la ventana se corre hasta él. |
| **Secuencia** (página principal) | En la vista «Por horas» las barras crecen desde la izquierda, una fila tras otra. (La vista «Cada sismo» ya tenía su animación.) |
| **Historia sísmica** (`/historia`) | Los puntos del mapa y los números del mapa de los 12 mayores aparecen uno tras otro y reaccionan al cursor; el sismo de 2026 late; las barras de las décadas crecen al llegar a la pantalla (en navegadores sin esa función, al cargar). Solo CSS. |

**Selección cruzada.** Solo hay una selección a la vez (un intervalo, una banda de magnitud o una de profundidad). Aparece un aviso «Intervalo / Magnitud / Profundidad: … · N de M sismos resaltados» con *Quitar selección*; cambiar un filtro (periodo, magnitud, fuentes) la quita y deshace el zoom. Las bandas tienen `min` incluido y `max` excluido (`lib/analytics.ts`), la misma regla de las barras, así que lo resaltado coincide exactamente con el número de cada barra.

**Accesibilidad y movimiento**
- Con **«Reducir animaciones»** (el interruptor del panel de accesibilidad o el ajuste del sistema) no hay animaciones ni transiciones, las barras de Recharts se dibujan completas de golpe y los números saltan al valor final (`app/analisis/motion.tsx`).
- Teclado: la gráfica de actividad se recorre con las flechas y se elige con Enter o espacio; las filas de magnitud y profundidad son botones (`aria-pressed`); todos los controles miden 40 px o más; la reproducción anuncia solo su inicio y su final (no cada sismo) por `aria-live`.
- Nada se dice solo con animación: lo que se resalta también está en el aviso de selección, la tabla y el texto de la ventana de tiempo.
- Corregido de paso: el pie de `/analisis` tenía texto gris sobre la banda azul del sitio (contraste 2.3; el mínimo es 4.5) y ya estaba así en producción; ahora usa los colores claros del pie del sitio.

**Cómo se probó**
- 25 pruebas con valores en los límites (magnitud 4.0, 4.99, 5.0; profundidad negativa, 10 km, sin dato; intervalos): lo resaltado siempre es igual al número de cada barra.
- En el navegador (desarrollo y `next build` + `next start`, que aplica la política de seguridad de producción): elegir intervalos y bandas con el ratón y con el teclado, acercar/alejar/desplazar con botones, arrastre y Ctrl + rueda, *Anterior/Siguiente*, quitar la selección, y la reproducción de 39 y 505 sismos en desarrollo (505 en ~18 s a ritmo constante; la animación usa un reloj real, así que si el navegador va lento muestra varios sismos juntos en vez de alargarse) y de 229 en producción (arranque, avance y «Salir»). También: la ventana mínima de 5 min, que al elegir un sismo fuera de la ventana esta se corre hasta él, que cambiar el periodo quita zoom y selección, la cruz punteada y el crecimiento del punto con un cursor real, el aro de un sismo nuevo (se simuló la llegada de uno falso, rotulado «PRUEBA LOCAL», solo en la pestaña de prueba) y que durante la reproducción la lectura no se anuncia a los lectores de pantalla (solo «Reproducción iniciada» y su final). Sin errores nuevos en la consola ni bloqueos de la política de seguridad.
- axe-core 4.11: **0 violaciones** en `/analisis` en escritorio (estado inicial, con selección y detalle, y durante la reproducción), en teléfono de 375 px (inicial y con selección), con el texto al 130 % (sin desborde horizontal) y en `/historia` (escritorio).
- Con «Reducir animaciones» activado: sin animaciones, sin transiciones y el área acumulada se dibuja completa al instante.

**Lo que no se ha probado:** en un teléfono real, con VoiceOver o TalkBack, ni en Safari ni Firefox (solo Chromium). Con 500 puntos la reproducción corrió a ~37 cuadros por segundo en desarrollo; no se midió en producción ni en teléfonos de gama baja, ni con más de ~1 000 sismos. En la prueba de producción el aviso de la selección y la reproducción se comprobaron, pero no se repitió la auditoría de axe en ese modo.

**Archivos:** `app/analisis/charts.tsx` (gráficas), `app/analisis/timeline-panel.tsx` (zoom, desplazamiento y reproducción), `app/analisis/motion.tsx` (reducir movimiento y «visto en pantalla»), `app/analisis/dashboard.tsx` (selección cruzada), `app/analisis/analisis.css`, `lib/analytics.ts` (rangos de las bandas), `app/analisis/format.ts` (pasos de 1, 2 y 5 min en el eje), `app/sequence-chart.tsx` y `app/globals.css`, `app/historia/*`.

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
