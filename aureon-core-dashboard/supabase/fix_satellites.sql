-- ---------------------------------------------------------------------------
-- Aureon Core — corrigir/recriar a tabela satellites do zero e criar os
-- satélites do primeiro hub (já existente).
--
-- Seguro de correr: só mexe na tabela satellites, que ainda está vazia.
-- Não apaga nem altera "properties" nem "hubs".
--
-- Como usar: copia tudo, cola no SQL Editor da Supabase, clica em "Run".
-- ---------------------------------------------------------------------------

-- 1) Apagar a tabela satellites tal como está agora (com o que quer que lá
--    tenhas mexido sem querer) e recriá-la exatamente como devia ser.
drop table if exists satellites cascade;

create table satellites (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  hub_id uuid not null references hubs(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  label text not null,
  capabilities text[] not null default '{}',
  battery numeric,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

alter table satellites enable row level security;

create policy "scoped satellites" on satellites
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

-- Restaurar a ligação entre alerts e satellites (foi quebrada pelo "cascade" acima)
alter table alerts drop constraint if exists alerts_satellite_id_fkey;
alter table alerts add constraint alerts_satellite_id_fkey
  foreign key (satellite_id) references satellites(id);

-- 2) Criar os 2 satélites para o hub que já tens (vai automaticamente buscar
--    o teu único hub existente — não precisas de saber o id nem o device_id dele).
insert into satellites (device_id, hub_id, property_id, label, capabilities)
select 'AC-RSN-0001', h.id, h.property_id, 'Casa de banho - fuga + movimento', array['leak','motion']
from hubs h
limit 1;

insert into satellites (device_id, hub_id, property_id, label, capabilities)
select 'AC-RSN-0002', h.id, h.property_id, 'Porta de entrada', array['doorWindow']
from hubs h
limit 1;

-- 3) Confirmar que ficou tudo bem
select p.name, h.device_id as hub, s.device_id as satellite, s.capabilities
from properties p
join hubs h on h.property_id = p.id
join satellites s on s.hub_id = h.id;
