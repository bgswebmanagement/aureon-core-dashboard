-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1: base de dados para contas e RLS (SOMENTE ADITIVO)
--
-- NÃO apaga nenhuma regra (policy) antiga; as regras antigas (owner_id /
-- profiles.property_id) ficam até ao PR 4. Como o Postgres junta regras com
-- "OU", as novas só acrescentam acesso por property_members. Hoje não há
-- utilizadores nem owner_id preenchido, por isso nada muda para ninguém.
--
-- Efeitos que NÃO são puramente aditivos (propositadamente):
--   * sensor_readings: retira SELECT a anon/authenticated (só a vista lê).
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

create policy "membros: satelites" on satellites
  for select using (is_member(property_id));

create policy "membros: alertas" on alerts
  for select using (is_member(property_id));

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

-- 5) Consentimentos — vários inquilinos por casa:
--    * qualquer inquilino da casa pode dar OU retirar;
--    * a retirada por qualquer um prevalece (desativa o consentimento ativo);
--    * só pode existir um consentimento ativo por casa+categoria;
--    * nunca se apaga nem se reativa: um novo consentimento é uma nova linha;
--    * fica registado quem deu (created_by) e quem retirou (revoked_by).
alter table consent_grants add column if not exists revoked_by uuid references auth.users(id);
alter table consent_grants add column if not exists revoked_at timestamptz;

create unique index if not exists consent_one_active_per_category
  on consent_grants (property_id, category) where active;

create or replace function consent_grants_stamp() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- quem dá o consentimento é sempre a sessão, nunca um valor enviado pelo cliente
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
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
