-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 4: LIMPEZA das regras antigas (owner_id / profiles.property_id)
--
-- *** PARA REVISÃO — NÃO APLICADO. Só se aplica com autorização do Bruno, depois
-- *** de um ensaio com ROLLBACK (ver auth_pr4_down.sql para reverter).
--
-- Contexto: o PR 1 acrescentou regras novas (por property_members) SEM apagar as
-- antigas, que usam properties.owner_id e profiles.property_id. O Postgres junta
-- regras com "OU", por isso as antigas continuam a dar acesso: se alguém
-- preenchesse owner_id numa casa, esse utilizador passaria a ler TODOS os
-- eventos dela (incluindo movimento/porta) sem consentimento, porque a regra
-- antiga "scoped rsn_events" não conhece o consentimento. Esta limpeza fecha
-- essa porta.
--
-- Efeito hoje (verificado na base de dados real em leitura): NENHUM dado é
-- alterado e ninguém perde acesso — properties.owner_id e profiles.property_id
-- estão vazios em todas as linhas (0 de 2 casas; 0 de 3 perfis), por isso estas
-- regras antigas não dão acesso a ninguém.
--
-- Fica: "read own profile" (profiles), "ver as minhas ligacoes" (property_members)
-- e todas as regras novas ("membros: …" e "consent: …").
-- Antes: 20 regras. Depois: 10 regras.
-- ---------------------------------------------------------------------------

-- PARTE A — apaga as 10 regras antigas ---------------------------------------
drop policy if exists "owners manage their properties" on properties;                 -- ALL (escrita!) por owner_id
drop policy if exists "tenants read their property" on properties;                    -- por profiles.property_id
drop policy if exists "owners read their tenants" on tenants;                         -- por owner_id
drop policy if exists "scoped hubs" on hubs;                                          -- por owner_id / profiles.property_id
drop policy if exists "scoped satellites" on satellites;                              -- (tabela já sem SELECT para clientes)
drop policy if exists "scoped sensor_readings" on sensor_readings;                    -- (tabela já sem SELECT para clientes)
drop policy if exists "scoped rsn_events" on rsn_events;                              -- dava TODOS os eventos, sem consentimento
drop policy if exists "scoped alerts" on alerts;                                      -- por owner_id / profiles.property_id
drop policy if exists "owners read consent grants for their properties" on consent_grants;  -- por owner_id
drop policy if exists "tenants manage their consent grants" on consent_grants;        -- ALL por profiles.property_id

-- PARTE B — OPCIONAL, deixada em comentário de propósito ---------------------
-- Apaga as duas colunas que só serviam essas regras. Hoje estão vazias, por isso
-- não se perde nenhum dado; mas é irreversível sem cópia de segurança do que
-- vier a ser escrito nelas, e nada no código as usa. Recomendo fazê-lo mais tarde,
-- num passo à parte, depois de a limpeza da parte A estar em produção.
--
-- alter table properties drop column if exists owner_id;
-- alter table profiles   drop column if exists property_id;

-- PARTE C — OPCIONAL, em comentário: esconder bateria e sinal dos eventos ----
-- A tabela rsn_events tem as colunas battery e rssi (valores EXATOS em cada
-- evento). As regras de linha deixam o dono ver os eventos de fuga; sem esta
-- parte, uma conta com sessão podia pedir battery/rssi desses eventos
-- diretamente à API e contornar a bateria arredondada de satellites_visible.
-- A aplicação não precisa dessas colunas (lê só node_id, event e recorded_at).
-- RECOMENDADO ativar (descomentar), no mesmo passo da parte A.
-- Efeito: pedidos de uma conta de utilizador que peçam essas colunas, ou
-- «select *» em rsn_events, passam a falhar com «permission denied».
-- A service_role (ingest e /admin) não é afetada.
--
-- revoke select on rsn_events from authenticated;
-- grant select (id, hub_id, property_id, node_id, event, recorded_at, created_at)
--   on rsn_events to authenticated;
