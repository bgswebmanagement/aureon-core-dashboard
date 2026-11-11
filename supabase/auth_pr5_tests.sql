-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 5: TESTES da regra nova em `tenants`
--
-- COMO CORRER (nunca deixa nada gravado), numa só chamada:
--   begin;
--     <conteúdo de auth_pr5_up.sql>
--     <conteúdo deste ficheiro>
--   rollback;
-- Cria utilizadores e casas FALSOS dentro da transação; o rollback desfaz tudo.
-- NÃO CORRIDO ainda: só depois da autorização do Bruno.
--
-- Utilizadores: dono A = 1111…  inquilino A1 = 2222…  inquilino A2 = 3333…
--               inquilino B1 = 5555…   Casas: A = aaaa…  B = bbbb…
-- Linhas em `tenants`: A1 e A2 (casa A, com user_id), B1 (casa B), e uma linha
-- da casa A SEM user_id (criada à mão).
-- ---------------------------------------------------------------------------

create temp table teste_resultados (id serial primary key, teste text, resultado text);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'dono-a@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'inq-a1@teste.invalid', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'inq-a2@teste.invalid', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'inq-b1@teste.invalid', 'authenticated', 'authenticated');

insert into properties (id, name, address, city) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE Casa A', 'Rua A', 'Teste'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTE Casa B', 'Rua B', 'Teste');

insert into profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'tenant'),
  ('33333333-3333-3333-3333-333333333333', 'tenant'),
  ('55555555-5555-5555-5555-555555555555', 'tenant');

insert into property_members (user_id, property_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into tenants (property_id, user_id, name, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'TESTE Inq A1', 'inq-a1@teste.invalid'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'TESTE Inq A2', 'inq-a2@teste.invalid'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'TESTE Inq B1', 'inq-b1@teste.invalid'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'TESTE Inq sem conta', 'sem-conta@teste.invalid');

-- ===== T01: o inquilino A1 vê SÓ a sua linha ================================
do $$
declare n int; nome text;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), min(name) into n, nome from tenants;
  reset role;
  if n <> 1 or nome <> 'TESTE Inq A1' then
    raise exception 'A1 viu % linhas (%), esperava só a dele', n, nome;
  end if;
  insert into teste_resultados (teste, resultado) values ('T01 inquilino A1 vê só a sua linha', 'OK');
exception when others then
  reset role;
  insert into teste_resultados (teste, resultado) values ('T01 inquilino A1 vê só a sua linha', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T02: não vê o colega da mesma casa, nem a casa B, nem a linha sem conta
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from tenants where name in ('TESTE Inq A2', 'TESTE Inq B1', 'TESTE Inq sem conta');
  reset role;
  if n <> 0 then raise exception 'A1 viu % linhas de outras pessoas', n; end if;
  insert into teste_resultados (teste, resultado) values ('T02 inquilino não vê colega, outra casa nem linha sem conta', 'OK');
exception when others then
  reset role;
  insert into teste_resultados (teste, resultado) values ('T02 inquilino não vê colega, outra casa nem linha sem conta', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T03: o dono A continua a ver os inquilinos da SUA casa (3), não os da B
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from tenants;
  reset role;
  if n <> 3 then raise exception 'dono A viu % linhas, esperava 3 (A1, A2, sem conta)', n; end if;
  insert into teste_resultados (teste, resultado) values ('T03 dono A continua a ver os 3 registos da casa A (nenhum da B)', 'OK');
exception when others then
  reset role;
  insert into teste_resultados (teste, resultado) values ('T03 dono A continua a ver os 3 registos da casa A (nenhum da B)', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T04: o inquilino não escreve em `tenants` (nem na sua linha) ==========
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update tenants set name = 'HACK' where user_id = '22222222-2222-2222-2222-222222222222';
    reset role;
    raise exception 'o inquilino conseguiu alterar tenants';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T04 inquilino sem escrita em tenants', 'OK');
exception when others then
  reset role;
  insert into teste_resultados (teste, resultado) values ('T04 inquilino sem escrita em tenants', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T05: sem login (anon) não lê tenants ==================================
do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform 1 from tenants limit 1;
    reset role;
    raise exception 'anon conseguiu ler tenants';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T05 anon sem acesso a tenants', 'OK');
exception when others then
  reset role;
  insert into teste_resultados (teste, resultado) values ('T05 anon sem acesso a tenants', 'FALHOU: ' || sqlerrm);
end $$;

select teste, resultado from teste_resultados order by id;
