-- =========================================================================
-- ESQUEMA DE BASE DE DATOS SUPABASE PARA ALERTAS SÍSMICAS EN TIEMPO REAL
-- Proyecto: Ojo Panamá
-- =========================================================================

-- 1. Tabla para registrar suscripciones de dispositivos (Web Push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  min_magnitude numeric default 3.0,
  created_at timestamp with time zone default now(),
  last_seen timestamp with time zone default now(),
  -- Con qué clave VAPID del servidor se creó la suscripción ('v1' o 'v2'): se le envía firmando con esa. Ver lib/push-service.ts.
  vapid_key text not null default 'v1' check (vapid_key in ('v1', 'v2'))
);
-- En una base creada antes de este cambio:
alter table public.push_subscriptions add column if not exists vapid_key text not null default 'v1' check (vapid_key in ('v1', 'v2'));

-- Índices para búsqueda rápida
create index if not exists idx_push_subs_min_mag on public.push_subscriptions(min_magnitude);
create index if not exists idx_push_subs_endpoint on public.push_subscriptions(endpoint);

-- 2. Tabla para evitar duplicar alertas de sismos ya emitidos
create table if not exists public.notified_quakes (
  id text primary key,
  magnitude numeric,
  place text,
  time bigint not null,
  notified_at timestamp with time zone default now()
);

create index if not exists idx_notified_quakes_time on public.notified_quakes(time desc);

-- 3. Habilitar Row Level Security (RLS)
alter table public.push_subscriptions enable row level security;
alter table public.notified_quakes enable row level security;

-- Los roles públicos de Supabase (anon / authenticated) no deben tocar estas tablas: la clave "anon" es pública y
-- cualquiera podría leer las claves de las suscripciones push. Solo el backend usa service_role.
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.notified_quakes from anon, authenticated;

-- Permitir acceso al rol service_role (usado por el backend de Next.js)
drop policy if exists "Allow service_role full access to push_subscriptions" on public.push_subscriptions;
create policy "Allow service_role full access to push_subscriptions"
  on public.push_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow service_role full access to notified_quakes" on public.notified_quakes;
create policy "Allow service_role full access to notified_quakes"
  on public.notified_quakes
  for all
  to service_role
  using (true)
  with check (true);

-- =========================================================================
-- 4. DISPARADOR DEL CHEQUEO DE PUSH (necesario para avisar al celular con la app cerrada)
--
-- Vercel Hobby solo permite crons de una vez al día, así que el chequeo lo dispara Supabase.
-- Sin esto, el celular solo se entera cuando alguien tiene la página abierta (la consulta de sismos también
-- revisa los push, pero no hay garantía de que haya alguien conectado).
-- Requiere habilitar las extensiones 'pg_cron' y 'pg_net' en Supabase (Database > Extensions).
-- Si en Vercel definiste CRON_SECRET, cambia TU_CRON_SECRET por su valor.
-- =========================================================================

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

-- select cron.schedule(
--   'cron-check-sismos-panama',
--   '30 seconds', -- cada 30 s; el mínimo de la sintaxis cron clásica ('* * * * *') es 1 minuto
--   $$
--   select net.http_get(
--     url := 'https://sismopanama.vercel.app/api/cron/check-quakes',
--     headers := jsonb_build_object('Authorization', 'Bearer TU_CRON_SECRET'),
--     timeout_milliseconds := 25000
--   );
--   $$
-- );

-- =========================================================================
-- 5. REPORTES «¿LO SENTISTE?» DE LAS PERSONAS (página /reportes)
--
-- Privacidad: solo se guarda la localidad que eligió la persona de una lista (id de GeoNames de lib/places.ts), nunca su
-- ubicación exacta. `reporter` e `ip_key` son HMAC con una clave del servidor (REPORTS_SECRET): sirven para no contar dos
-- veces el mismo dispositivo y para limitar envíos masivos, sin guardar la IP ni poder recuperarla.
-- Los datos del sismo (hora, magnitud, lugar, epicentro) los copia el servidor del catálogo, no los manda el navegador.
-- =========================================================================
create table if not exists public.felt_reports (
  id bigint generated always as identity primary key,
  event_id text not null check (char_length(event_id) <= 60),
  event_time bigint not null,
  event_mag numeric,
  event_place text check (char_length(event_place) <= 200),
  event_lat numeric not null,
  event_lng numeric not null,
  felt boolean not null,
  intensity smallint check ((felt and intensity between 1 and 4) or (not felt and intensity is null)),
  place_id text not null check (char_length(place_id) <= 20),
  reporter text not null check (char_length(reporter) <= 64),
  ip_key text not null check (char_length(ip_key) <= 64),
  -- Ya no se usa: antes marcaba reportes apartados («fuera-del-pais», «poco-creible»). Hoy se cuentan todos los reportes.
  flagged text check (flagged in ('fuera-del-pais', 'poco-creible')),
  created_at timestamp with time zone not null default now(),
  -- Un reporte por dispositivo y sismo.
  unique (event_id, reporter)
);

create index if not exists idx_felt_reports_event_time on public.felt_reports(event_time) where flagged is null;
create index if not exists idx_felt_reports_ip_recent on public.felt_reports(ip_key, created_at);

alter table public.felt_reports enable row level security;
revoke all on table public.felt_reports from anon, authenticated;

drop policy if exists "Allow service_role full access to felt_reports" on public.felt_reports;
create policy "Allow service_role full access to felt_reports"
  on public.felt_reports
  for all
  to service_role
  using (true)
  with check (true);
