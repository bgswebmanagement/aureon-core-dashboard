-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1: base de dados para contas e RLS (SOMENTE ADITIVO)
--
-- NÃO apaga nenhuma regra (policy) antiga; as regras antigas (owner_id /
-- profiles.property_id) ficam até ao PR 4. Como o Postgres junta regras com
-- "OU", as novas só acrescentam acesso por property_members. Hoje não há
-- utilizadores nem owner_id preenchido, por isso nada muda para ninguém.
--
-- Efeitos que NÃO são puramente aditivos (propositadamente):
--   * sensor_readings e satellites: retira SELECT a anon/authenticated (só as
--     vistas sensor_readings_visible e satellites_visible leem).
--   * consent_grants: retira UPDATE/DELETE a authenticated e dá só
--     UPDATE (active).
--   * profiles: retira escrita a anon/authenticated.
-- O /api/ingest e o resto da app usam a chave service_role, que NÃO é afetada.
--
-- Sem BEGIN/COMMIT aqui dentro: quem aplica trata da transação.
-- Reversão: supabase/auth_pr1_down.sql. Testes: supabase/auth_pr1_tests.sql.
-- ---------------------------------------------------------------------------

-- 1) Pessoa <-> casa (uma pessoa pode ter várias casas; uma casa várias pessoas)
create table if not exists property_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
create index if not exists property_members_property_idx on property_members (property_id);
alter table property_members enable row level security;
create policy "ver as minhas ligacoes" on property_members
  for select using (user_id = auth.uid());
revoke all on property_members from anon;
revoke insert, update, delete on property_members from authenticated;

-- 2) Funções auxiliares. "security definer" evita ciclos entre regras.
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function my_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_member(p uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from property_members where user_id = auth.uid() and property_id = p
  )
$$;

-- Consentimento ativo e não expirado. Só responde a quem pertence à casa.
create or replace function has_consent(p uuid, cat text) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_member(p) and exists (
    select 1 from consent_grants
    where property_id = p and category = cat and active
      and (expires_at is null or expires_at > now())
  )
$$;

revoke execute on function is_admin(), my_role(), is_member(uuid), has_consent(uuid, text)
  from public, anon;
grant execute on function is_admin(), my_role(), is_member(uuid), has_consent(uuid, text)
  to authenticated;

-- 3) Regras novas (acrescentam-se às antigas, que ficam)
create policy "membros: casas" on properties
  for select using (is_member(id));

create policy "membros: dono ve inquilinos" on tenants
  for select using (my_role() = 'owner' and is_member(property_id));

create policy "membros: hubs" on hubs
  for select using (is_member(property_id));

-- Alertas: a "tag" é texto traduzível para mostrar no ecrã, por isso a
-- segurança assenta numa coluna "category" com valores fixos (a tabela está
-- vazia; a app calcula hoje os alertas em lib/data.ts).
--   * inquilino: vê tudo da sua casa;
--   * dono: leak, humidity, temperature, voc sempre; motion, doorWindow e
--     sound só com consentimento ativo e não expirado dessa categoria;
--     'device' (ex.: satélite offline) segue a mesma regra do last_seen do
--     satélite a que está ligado (can_see_satellite_activity); sem satélite
--     ligado é visível.
--   * uma categoria nova só fica visível ao dono quando esta regra for
--     alterada de propósito (fechado por omissão).
-- (as regras de "alerts" estão mais abaixo, na secção 4c)

-- Eventos: o inquilino vê tudo; qualquer outro membro (dono) vê fugas sempre
-- e o resto só com consentimento ativo. Tipos de evento desconhecidos ficam
-- escondidos do dono (por omissão, seguro).
create policy "membros: eventos" on rsn_events
  for select using (
    is_member(property_id) and (
      my_role() = 'tenant'
      or event = 'leak_detected'
      or (event = 'motion_detected' and has_consent(property_id, 'motion'))
      or (event in ('door_open', 'door_closed') and has_consent(property_id, 'doorWindow'))
    )
  );

-- 4) Leituras: ninguém (anon/authenticated) lê a tabela diretamente — só a
--    vista, que filtra por casa e esconde o som a quem não pode ver.
--    A vista corre com os direitos do dono da tabela (de propósito), por isso
--    o filtro "is_member" dentro dela é obrigatório. O verificador do
--    Supabase vai avisar "security definer view": é esperado.
create or replace view sensor_readings_visible as
  select
    id, hub_id, property_id, recorded_at, temperature, humidity, voc, pressure,
    case when my_role() = 'tenant' or has_consent(property_id, 'sound')
         then sound_dbfs end as sound_dbfs,
    case when my_role() = 'tenant' or has_consent(property_id, 'sound')
         then sound_max_dbfs end as sound_max_dbfs,
    case when my_role() = 'tenant' or has_consent(property_id, 'sound')
         then sound_loud_seconds end as sound_loud_seconds
  from sensor_readings
  where is_member(property_id);

revoke all on sensor_readings_visible from anon;
grant select on sensor_readings_visible to authenticated;
revoke select on sensor_readings from anon, authenticated;

-- 4b) Satélites. O firmware atualiza satellites.last_seen e satellites.battery
--     a CADA evento (app/api/ingest/route.ts), por isso num satélite com
--     movimento ou porta/janela revelam QUANDO houve atividade. (O satélite
--     real AC-RSN-0001 tem fuga+movimento.) Regra: a atividade (last_seen e
--     bateria exata) só aparece ao inquilino, ou ao dono quando existe
--     consentimento para CADA categoria restrita do satélite. Satélites só de
--     fuga não são restritos. Sem consentimento a bateria aparece arredondada
--     para baixo à dezena (87 -> 80): chega para saber se está a acabar, mas
--     não deixa detetar um evento pela variação de 1 ponto.
--     A tabela satellites deixa de ser legível diretamente.
create or replace function can_see_satellite_activity(p uuid, caps text[]) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_member(p) and (
    my_role() = 'tenant'
    or (
      ('motion' <> all (caps) or has_consent(p, 'motion'))
      and ('doorWindow' <> all (caps) or has_consent(p, 'doorWindow'))
    )
  )
$$;
revoke execute on function can_see_satellite_activity(uuid, text[]) from public, anon;
grant execute on function can_see_satellite_activity(uuid, text[]) to authenticated;

create or replace view satellites_visible as
  select
    id, device_id, hub_id, property_id, label, capabilities,
    case when can_see_satellite_activity(property_id, capabilities)
         then battery else floor(battery / 10) * 10 end as battery,
    case when can_see_satellite_activity(property_id, capabilities)
         then last_seen end as last_seen,
    created_at
  from satellites
  where is_member(property_id);

revoke all on satellites_visible from anon;
grant select on satellites_visible to authenticated;
revoke select on satellites from anon, authenticated;

-- 4c) Alertas (ver comentário em 3). Os alertas 'device' ligados a um satélite
--     consultam a tabela satellites, que o utilizador já não pode ler: por
--     isso a consulta vive numa função security definer.
alter table alerts add column if not exists category text;
alter table alerts add constraint alerts_category_check check (
  category in ('leak', 'humidity', 'temperature', 'voc', 'device', 'motion', 'doorWindow', 'sound')
);
-- (a tabela tem de estar vazia; confirmar antes de aplicar)
alter table alerts alter column category set not null;

create or replace function can_see_alert_satellite(sat uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from satellites s
    where s.id = sat and can_see_satellite_activity(s.property_id, s.capabilities)
  )
$$;
revoke execute on function can_see_alert_satellite(uuid) from public, anon;
grant execute on function can_see_alert_satellite(uuid) to authenticated;

create policy "membros: alertas" on alerts
  for select using (
    is_member(property_id) and (
      my_role() = 'tenant'
      or category in ('leak', 'humidity', 'temperature', 'voc')
      or (category = 'motion' and has_consent(property_id, 'motion'))
      or (category = 'doorWindow' and has_consent(property_id, 'doorWindow'))
      or (category = 'sound' and has_consent(property_id, 'sound'))
      or (category = 'device' and (satellite_id is null or can_see_alert_satellite(satellite_id)))
    )
  );

-- 5) Consentimentos — vários inquilinos por casa:
--    * qualquer inquilino da casa pode dar OU retirar;
--    * a retirada por qualquer um prevalece (desativa o consentimento ativo);
--    * só pode existir um consentimento ativo por casa+categoria;
--    * nunca se apaga nem se reativa: um novo consentimento é uma nova linha;
--    * fica registado quem deu (created_by) e quem retirou (revoked_by).
alter table consent_grants add column if not exists revoked_by uuid references auth.users(id);
alter table consent_grants add column if not exists revoked_at timestamptz;

-- ATENÇÃO PR 6: este índice conta como "ativo" um consentimento com
-- active = true MESMO que expires_at já tenha passado (a regra de acesso já
-- ignora os expirados, o índice não). Por isso, antes de criar um novo
-- consentimento, a aplicação tem de desativar (active = false) os expirados
-- dessa casa+categoria; senão o novo é recusado com unique_violation.
create unique index if not exists consent_one_active_per_category
  on consent_grants (property_id, category) where active;

create or replace function consent_grants_stamp() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- quem dá o consentimento e quando são sempre da sessão/servidor,
    -- nunca valores enviados pelo cliente
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.granted_at := now();
    end if;
    new.revoked_by := null;
    new.revoked_at := null;
  else
    if old.active and not new.active then
      new.revoked_by := coalesce(auth.uid(), new.revoked_by);
      new.revoked_at := now();
    else
      new.revoked_by := old.revoked_by;
      new.revoked_at := old.revoked_at;
    end if;
  end if;
  return new;
end $$;

create trigger consent_grants_stamp_ins before insert on consent_grants
  for each row execute function consent_grants_stamp();
create trigger consent_grants_stamp_upd before update on consent_grants
  for each row execute function consent_grants_stamp();

create policy "consent: membros leem" on consent_grants
  for select using (is_member(property_id));

create policy "consent: inquilino cria" on consent_grants
  for insert with check (my_role() = 'tenant' and is_member(property_id));

create policy "consent: inquilino retira" on consent_grants
  for update
  using (my_role() = 'tenant' and is_member(property_id) and active)
  with check (my_role() = 'tenant' and is_member(property_id) and not active);

revoke update, delete on consent_grants from authenticated;
grant update (active) on consent_grants to authenticated;

-- 6) Ninguém se promove a si próprio (profiles já só tinha regra de leitura)
revoke insert, update, delete on profiles from anon, authenticated;
