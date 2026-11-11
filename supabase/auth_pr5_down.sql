-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 5: REVERSÃO de auth_pr5_up.sql
-- *** PARA REVISÃO — NÃO APLICADO.
--
-- Volta a deixar `tenants` legível só pelo dono (e pelo administrador, que usa
-- a chave de serviço). Depois disto o inquilino deixa de ver a sua linha.
-- ---------------------------------------------------------------------------

drop policy if exists "membros: inquilino ve a sua linha" on public.tenants;
