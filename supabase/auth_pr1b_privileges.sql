-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1b: CORREÇÃO de permissões (aplicar DEPOIS de auth_pr1_up.sql)
--
-- Problema encontrado ao verificar a base de dados real depois do PR 1:
-- as vistas sensor_readings_visible e satellites_visible nasceram com
-- INSERT/UPDATE/DELETE para "authenticated" (permissões por omissão do
-- Supabase). Como as vistas correm com os direitos do dono e são
-- "atualizáveis", um utilizador com sessão (mesmo sem casa) conseguia
-- inserir leituras, alterar satélites e apagar leituras. Provado numa
-- transação com ROLLBACK (UPDATE 2 linhas, INSERT aceite, DELETE 1 linha).
--
-- Só REVOKEs (reversíveis). A service_role (ingest e /admin) não é afetada.
-- Reversão: auth_pr1_down.sql repõe "grant all" a anon/authenticated.
-- ---------------------------------------------------------------------------

-- Vistas e tabelas de leitura: ninguém escreve por aqui (só a service_role, no ingest)
revoke insert, update, delete, truncate, references, trigger
  on sensor_readings_visible, satellites_visible from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on sensor_readings, satellites from anon, authenticated;

-- anon nunca precisa destas tabelas (a app lê com service_role ou com sessão)
revoke all on sensor_readings, satellites, consent_grants, profiles, property_members from anon;

-- authenticated: sem TRUNCATE/REFERENCES/TRIGGER nas tabelas sensíveis
revoke truncate, references, trigger on consent_grants, profiles, property_members from authenticated;

-- aviso do verificador do Supabase (function_search_path_mutable)
alter function consent_grants_stamp() set search_path = public;
