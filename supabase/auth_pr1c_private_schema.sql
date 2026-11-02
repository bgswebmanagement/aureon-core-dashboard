-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1c: funções auxiliares num esquema NÃO exposto
-- (aplicar DEPOIS de auth_pr1_up.sql e auth_pr1b_privileges.sql)
--
-- O verificador do Supabase avisava (6x, "authenticated_security_definer_
-- function_executable") que as funções is_admin, my_role, is_member,
-- has_consent, can_see_satellite_activity e can_see_alert_satellite estavam no
-- esquema "public", logo chamáveis por qualquer conta em /rest/v1/rpc/...
-- O esquema "private" não é exposto pela API (só "public" e "graphql_public").
--
-- ALTER FUNCTION ... SET SCHEMA mantém o identificador interno da função, por
-- isso as regras (policies) e as vistas que a usam continuam a apontar para a
-- mesma função, sem serem recriadas. O corpo das funções chama as outras pelo
-- nome, por isso o search_path passa a incluir "private".
-- As regras correm com os direitos de quem consulta: esse utilizador precisa
-- de USAGE no esquema para alcançar as funções.
--
-- Reversão: supabase/auth_pr1c_down.sql (correr ANTES de auth_pr1_down.sql).
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_admin() set schema private;
alter function public.my_role() set schema private;
alter function public.is_member(uuid) set schema private;
alter function public.has_consent(uuid, text) set schema private;
alter function public.can_see_satellite_activity(uuid, text[]) set schema private;
alter function public.can_see_alert_satellite(uuid) set schema private;

-- "private" primeiro: os nomes das funções resolvem lá; as tabelas estão em public
alter function private.is_admin() set search_path = private, public, pg_temp;
alter function private.my_role() set search_path = private, public, pg_temp;
alter function private.is_member(uuid) set search_path = private, public, pg_temp;
alter function private.has_consent(uuid, text) set search_path = private, public, pg_temp;
alter function private.can_see_satellite_activity(uuid, text[]) set search_path = private, public, pg_temp;
alter function private.can_see_alert_satellite(uuid) set search_path = private, public, pg_temp;
