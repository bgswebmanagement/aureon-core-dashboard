-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1: REVERSÃO de supabase/auth_pr1_up.sql
-- Repõe o estado anterior (inclui as permissões que a subida retirou).
-- Como a subida não apagou regras antigas, não há nada antigo a recriar.
-- ---------------------------------------------------------------------------

-- permissões (estado original: anon e authenticated tinham tudo, sob RLS)
grant all on sensor_readings to anon, authenticated;
grant all on satellites to anon, authenticated;
grant update, delete on consent_grants to authenticated;
grant insert, update, delete on profiles to anon, authenticated;

-- consentimentos
drop policy if exists "consent: inquilino retira" on consent_grants;
drop policy if exists "consent: inquilino cria" on consent_grants;
drop policy if exists "consent: membros leem" on consent_grants;
drop trigger if exists consent_grants_stamp_upd on consent_grants;
drop trigger if exists consent_grants_stamp_ins on consent_grants;
drop function if exists consent_grants_stamp();
drop index if exists consent_one_active_per_category;
alter table consent_grants drop column if exists revoked_at;
alter table consent_grants drop column if exists revoked_by;

-- vista e regras novas
drop view if exists sensor_readings_visible;
drop view if exists satellites_visible;
drop function if exists can_see_satellite_activity(uuid, text[]);
drop policy if exists "membros: eventos" on rsn_events;
drop policy if exists "membros: alertas (so inquilino)" on alerts;
drop policy if exists "membros: hubs" on hubs;
drop policy if exists "membros: dono ve inquilinos" on tenants;
drop policy if exists "membros: casas" on properties;

-- funções e tabela de ligação
drop function if exists has_consent(uuid, text);
drop function if exists is_member(uuid);
drop function if exists my_role();
drop function if exists is_admin();
drop table if exists property_members;
