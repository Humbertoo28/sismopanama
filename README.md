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
