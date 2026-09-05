-- ---------------------------------------------------------------------------
-- Aureon Core — Supabase schema for the 10-unit pilot
--
-- Run this once in the Supabase SQL editor of a new project, then set
-- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
-- in your Vercel project (see README.md). The app automatically switches
-- from demo/seed data to these tables once those env vars are present.
--
-- Hardware model: ONE Hub per property (onboard ambient sensors — temp,
-- humidity, VOC/air quality, pressure) plus 1-3 battery-powered Satellite /
-- Remote Sensor Node units (leak, motion, door/window — event-based, not
-- continuous). This matches the architecture agreed with Count Customs and
-- the device description in the Pilot Program Agreement. There is no
-- per-room continuous sensing and no smoke/CO detection — the Pilot
-- Agreement explicitly states the System is not a certified smoke/CO
-- detector.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid references auth.users(id), -- linked once the tenant creates an account
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

-- One row per physical Hub (ESP32-S3). device_id is what the firmware sends
-- to /api/ingest — must match exactly what Count Customs flashes per unit.
-- `location` is just which room the Hub happens to be plugged in — the Hub
-- itself is the only source of ambient readings for the whole property.
create table if not exists hubs (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  property_id uuid not null references properties(id) on delete cascade,
  location text,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

-- Hub onboard sensor readings — one row every ~10 minutes per Hub.
create table if not exists sensor_readings (
  id bigint generated always as identity primary key,
  hub_id uuid not null references hubs(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  recorded_at timestamptz not null,
  temperature numeric,
  humidity numeric,
  voc numeric,
  pressure numeric,
  created_at timestamptz not null default now()
);
create index if not exists sensor_readings_hub_time_idx on sensor_readings (hub_id, recorded_at desc);

-- One row per physical Satellite / Remote Sensor Node (ESP32-C6, battery
-- powered). device_id is the node_id the Hub relays in rsn_events. A
-- property typically has 1-3 of these — e.g. a leak+motion satellite in the
-- bathroom, plus optional door/window satellites elsewhere.
create table if not exists satellites (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  hub_id uuid not null references hubs(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  label text not null,
  capabilities text[] not null default '{}', -- subset of: 'leak', 'motion', 'doorWindow'
  battery numeric,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

-- Remote Sensor Node events (leak detected, motion, door/window switch) —
-- event-driven, not on a fixed interval.
create table if not exists rsn_events (
  id bigint generated always as identity primary key,
  hub_id uuid not null references hubs(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  node_id text not null, -- matches satellites.device_id
  event text not null, -- e.g. 'leak_detected', 'motion_detected', 'door_open', 'door_closed'
  battery numeric,
  rssi numeric,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists rsn_events_hub_time_idx on rsn_events (hub_id, recorded_at desc);

-- Derived alerts (can be computed on read, or written by a scheduled
-- function/edge function that evaluates thresholds against sensor_readings
-- and rsn_events).
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  satellite_id uuid references satellites(id),
  device_label text, -- hub location or satellite label, for display
  title text not null,
  message text not null,
  severity text not null check (severity in ('informativo', 'aviso', 'critico')),
  tag text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Profiles map an auth.users row to a role + (for tenants) a property.
-- 'admin' = Aureon Core staff (Bruno). Not linked from the public landing
-- page (app/page.tsx) — reachable only at /admin. Same unrestricted access
-- as the Supabase Table Editor already gives today.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'tenant', 'admin')),
  property_id uuid references properties(id) -- only set for role = 'tenant'
);

-- Tenant-controlled authorization for the owner/agency to see a restricted
-- (presence/behaviour) satellite data category for their property — motion
-- or door/window. Leak events are never restricted; they're a
-- property-damage signal the owner always needs, so they have no row here.
-- Tenant creates/revokes their own grants; owner can only read the current
-- state (to know what's authorized), never write.
create table if not exists consent_grants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  category text not null check (category in ('motion', 'doorWindow')),
  reason text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id)
);
create index if not exists consent_grants_property_idx on consent_grants (property_id, category);

-- ---------------------------------------------------------------------------
-- Row Level Security — owners see everything they own, tenants see only
-- their own property.
-- ---------------------------------------------------------------------------

alter table properties enable row level security;
alter table tenants enable row level security;
alter table hubs enable row level security;
alter table satellites enable row level security;
alter table sensor_readings enable row level security;
alter table rsn_events enable row level security;
alter table alerts enable row level security;
alter table profiles enable row level security;
alter table consent_grants enable row level security;

create policy "owners manage their properties" on properties
  for all using (owner_id = auth.uid());

create policy "tenants read their property" on properties
  for select using (
    id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "owners read their tenants" on tenants
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
  );

create policy "scoped hubs" on hubs
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped satellites" on satellites
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped sensor_readings" on sensor_readings
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped rsn_events" on rsn_events
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped alerts" on alerts
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "read own profile" on profiles
  for select using (id = auth.uid());

-- Tenant manages (create/update/revoke) consent grants for their own
-- property only.
create policy "tenants manage their consent grants" on consent_grants
  for all using (
    property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  ) with check (
    property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

-- Owner can only read the current state of consent grants for properties
-- they own — never write. This tells the owner dashboard what's currently
-- authorized; it does not by itself unlock rsn_events rows (see note below).
create policy "owners read consent grants for their properties" on consent_grants
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
  );

-- Note: app/api/ingest/route.ts uses the SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS entirely — that's expected, since the Hub firmware has no
-- Supabase Auth session, only the shared INGEST_TOKEN.
--
-- Note on category-level privacy (motion/doorWindow) once this schema is
-- live: RLS above scopes rsn_events by property, matching today's app
-- (owner sees all events for properties they own). The actual per-category
-- filtering — hiding motion/doorWindow rows from an owner unless
-- consent_grants has an active row for that property+category — is applied
-- in the app's data layer (lib/consent.ts: filterEventsForViewer), the same
-- way it works against the seed dataset today. If/when this needs to be
-- enforced at the database level too (defense in depth), the simplest path
-- is a Postgres view per viewer role, or a security-definer RPC function
-- that joins rsn_events against consent_grants before returning rows to an
-- owner-scoped request.
