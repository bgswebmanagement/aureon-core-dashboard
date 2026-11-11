-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 5: o inquilino lê a SUA própria linha em `tenants`
--
-- *** PARA REVISÃO — NÃO APLICADO. Só se aplica com autorização do Bruno, depois
-- *** de um ensaio com ROLLBACK (auth_pr5_tests.sql). Reverter: auth_pr5_down.sql.
--
-- Contexto: hoje só o DONO tem regra de leitura em `tenants`
-- ("membros: dono ve inquilinos"). O inquilino não consegue ler nem a sua
-- própria linha (nome/email), e isso faz falta em dois sítios:
--   • o relatório (/report/[id]) mostra «Inquilino: <nome>» e, lido por um
--     inquilino com a sessão dele, apareceria «—»;
--   • páginas do inquilino que precisem do nome dele.
--
-- A regra nova dá ao inquilino o MÍNIMO: só a linha onde user_id = o seu id.
-- Nunca vê a linha de outro inquilino, nem da mesma casa. (`user_id` é
-- preenchido pelo convite em /admin/utilizadores; linhas sem user_id —
-- como as criadas à mão — continuam invisíveis para qualquer inquilino.)
--
-- Não muda privilégios: as colunas de `tenants` já têm SELECT para
-- `authenticated`; o que faltava era uma regra de linha. Não altera dados e
-- não mexe nas regras do dono nem do administrador (service_role).
-- Efeito hoje (verificado em leitura): `tenants` tem 0 linhas e 0 inquilinos
-- com conta, por isso ninguém ganha nem perde acesso agora.
-- ---------------------------------------------------------------------------

create policy "membros: inquilino ve a sua linha" on public.tenants
  for select
  using (private.my_role() = 'tenant' and user_id = auth.uid());
