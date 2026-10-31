-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1b: PRIVILÉGIO MÍNIMO (aplicar DEPOIS de auth_pr1_up.sql)
--
-- Problema encontrado ao verificar a base de dados real depois do PR 1:
-- as vistas sensor_readings_visible e satellites_visible nasceram com
-- INSERT/UPDATE/DELETE para "authenticated" (permissões por omissão do
-- Supabase). Como as vistas correm com os direitos do dono e são
-- "atualizáveis", um utilizador com sessão (mesmo sem casa) conseguia
-- inserir leituras, alterar satélites e apagar leituras. Provado numa
-- transação com ROLLBACK (UPDATE 2 linhas, INSERT aceite, DELETE 1 linha).
--
-- Regra desta correção: uma conta de cliente (authenticated) só LÊ, exceto
-- consent_grants (INSERT + UPDATE da coluna active). A anon não acede a nada.
-- Só REVOKEs (reversíveis). A service_role (ingest e /admin) não é afetada.
-- Reversão: auth_pr1_down.sql repõe "grant all" a anon/authenticated.
-- ---------------------------------------------------------------------------

-- anon nunca precisa das tabelas da app (lê-se com service_role ou com sessão)
revoke all on properties, tenants, hubs, rsn_events, alerts, sensor_readings,
  satellites, consent_grants, profiles, property_members from anon;

-- authenticated: nas tabelas de dados só pode ler (e onde a leitura já foi
-- retirada, nem isso: lê pelas vistas)
revoke insert, update, delete, truncate, references, trigger
  on properties, tenants, hubs, rsn_events, alerts, satellites, sensor_readings from authenticated;

-- vistas: só leitura
revoke insert, update, delete, truncate, references, trigger
  on sensor_readings_visible, satellites_visible from anon, authenticated;

-- tabelas de contas/consentimentos: sem TRUNCATE/REFERENCES/TRIGGER
-- (consent_grants mantém INSERT, SELECT e UPDATE só da coluna active)
revoke truncate, references, trigger on consent_grants, profiles, property_members from authenticated;

-- aviso do verificador do Supabase (function_search_path_mutable)
alter function consent_grants_stamp() set search_path = public;
