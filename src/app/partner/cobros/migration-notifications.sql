-- ── Migración: Sistema de Notificaciones Zonda Legal ─────────────────────────
-- Ejecutar en Supabase SQL Editor

-- ── 1. Tabla: partner_daily_sessions ─────────────────────────────────────────
-- Rastrea el primer acceso diario de cada partner al dashboard.
-- Cuando el partner abre el modal y hace clic en "Entendido", se inserta una fila.
-- Si ya existe una fila para hoy → no mostrar el modal.

create table if not exists partner_daily_sessions (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  seen_date  date    not null default current_date,
  seen_at    timestamptz not null default now(),
  primary key (user_id, seen_date)
);

alter table partner_daily_sessions enable row level security;

-- Solo el propio partner puede leer/insertar sus sesiones
create policy "partner_daily_sessions_select"
  on partner_daily_sessions for select
  using (auth.uid() = user_id);

create policy "partner_daily_sessions_insert"
  on partner_daily_sessions for insert
  with check (auth.uid() = user_id);

-- ── 2. Tabla: partner_notif_config ────────────────────────────────────────────
-- Configuración de notificaciones por WhatsApp por partner.
-- hora_envio: hora local Argentina en que se envía el adelanto nocturno (default: 20 = 8 PM)
-- whatsapp_activo: el partner puede desactivar las notificaciones WhatsApp

create table if not exists partner_notif_config (
  user_id         uuid    primary key references auth.users(id) on delete cascade,
  whatsapp_activo boolean not null default true,
  hora_envio      int     not null default 20 check (hora_envio >= 6 and hora_envio <= 23),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table partner_notif_config enable row level security;

create policy "partner_notif_config_select"
  on partner_notif_config for select
  using (auth.uid() = user_id);

create policy "partner_notif_config_upsert"
  on partner_notif_config for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger partner_notif_config_updated_at
  before update on partner_notif_config
  for each row execute function update_updated_at();

-- ── 3. Vista: partners_con_whatsapp ───────────────────────────────────────────
-- Usada por el cron job para saber a quién enviar el adelanto nocturno.
-- Combina perfil del partner con su config de notificaciones.

create or replace view partners_con_whatsapp as
select
  p.id          as user_id,
  p.nombre,
  p.whatsapp_link,
  coalesce(nc.whatsapp_activo, true) as whatsapp_activo,
  coalesce(nc.hora_envio, 20)        as hora_envio
from perfiles p
left join partner_notif_config nc on nc.user_id = p.id
where p.rol = 'partner'
  and p.whatsapp_link is not null
  and p.whatsapp_link != '';

-- Permisos de lectura para el service role (usado por el cron job)
grant select on partners_con_whatsapp to service_role;
