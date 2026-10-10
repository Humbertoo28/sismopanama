-- =========================================================================
-- ESQUEMA DE BASE DE DATOS SUPABASE PARA ALERTAS SÍSMICAS EN TIEMPO REAL
-- Proyecto: Sismo Panamá
-- =========================================================================

-- 1. Tabla para registrar suscripciones de dispositivos (Web Push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  min_magnitude numeric default 3.0,
  created_at timestamp with time zone default now(),
  last_seen timestamp with time zone default now()
);

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
