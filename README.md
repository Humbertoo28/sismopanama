# 🇵🇦 Sismo Panamá - Monitor Sísmico y Alertas en Tiempo Real

> **Observatorio cívico y sistema de alerta temprana ante réplicas y eventos sísmicos en la República de Panamá.**  
> Desarrollado por **Humberto Antonio** ([@humbertiex](https://www.instagram.com/humbertiex_)).

🌐 **Sitio Web Oficial en Producción:** [sismopanama.vercel.app](https://sismopanama.vercel.app)

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
