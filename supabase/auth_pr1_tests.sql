-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1: TESTES das regras (RLS), dono vs inquilino
--
-- COMO CORRER (nunca deixa nada gravado):
--   begin;
--     <conteúdo de auth_pr1_up.sql>      -- só se a subida ainda não foi aplicada
--     <conteúdo deste ficheiro>
--   rollback;
-- Cada teste imprime "OK Tn" ou pára com "FALHOU Tn". Cria utilizadores e
-- casas FALSOS dentro da transação; o rollback desfaz tudo.
--
-- Utilizadores:  dono A = 1111…  inquilino A1 = 2222…  inquilino A2 = 3333…
--                dono B = 4444…
-- Casas:         A = aaaa…   B = bbbb…
-- ---------------------------------------------------------------------------

-- ===== Preparação (como administrador da BD) ================================
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'dono-a@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'inq-a1@teste.invalid', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'inq-a2@teste.invalid', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'dono-b@teste.invalid', 'authenticated', 'authenticated');

insert into properties (id, name, address, city) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE Casa A', 'Rua A', 'Teste'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTE Casa B', 'Rua B', 'Teste');

insert into profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'tenant'),
  ('33333333-3333-3333-3333-333333333333', 'tenant'),
  ('44444444-4444-4444-4444-444444444444', 'owner');

insert into property_members (user_id, property_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into hubs (id, device_id, property_id) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'TESTE-HUB-A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'TESTE-HUB-B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into sensor_readings (hub_id, property_id, recorded_at, temperature, sound_dbfs, sound_max_dbfs, sound_loud_seconds) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 21, -40, -20, 3),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 22, -41, -21, 4);

insert into rsn_events (hub_id, property_id, node_id, event, recorded_at) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-N1', 'leak_detected', now()),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-N1', 'motion_detected', now()),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-N1', 'door_open', now()),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-N1', 'tipo_desconhecido', now()),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTE-N2', 'motion_detected', now());

-- ===== T1: o dono NÃO lê a tabela sensor_readings diretamente ===============
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from sensor_readings limit 1;
    reset role;
    raise exception 'FALHOU T1: o dono conseguiu ler sensor_readings diretamente';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  raise notice 'OK T1: dono sem acesso direto a sensor_readings';
end $$;

-- ===== T2: sem login (anon) também não lê a tabela nem a vista ==============
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform 1 from sensor_readings limit 1;
    reset role;
    raise exception 'FALHOU T2a: anon leu sensor_readings';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform 1 from sensor_readings_visible limit 1;
    reset role;
    raise exception 'FALHOU T2b: anon leu a vista';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  raise notice 'OK T2: anon sem acesso à tabela nem à vista';
end $$;

-- ===== T3: o dono lê a vista, só da sua casa, e SEM som =====================
do $$
declare n int; n_som int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), count(sound_dbfs) + count(sound_max_dbfs) + count(sound_loud_seconds)
    into n, n_som from sensor_readings_visible;
  reset role;
  if n <> 1 then raise exception 'FALHOU T3: dono vê % leituras (esperado 1)', n; end if;
  if n_som <> 0 then raise exception 'FALHOU T3: dono vê valores de som sem consentimento'; end if;
  raise notice 'OK T3: dono vê 1 leitura (da sua casa) com som escondido';
end $$;

-- ===== T4: o inquilino vê o som ============================================
do $$
declare s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if s is distinct from -40 then raise exception 'FALHOU T4: inquilino não vê o som (%)', s; end if;
  raise notice 'OK T4: inquilino vê o som';
end $$;

-- ===== T5: o dono só vê a sua casa e o seu hub =============================
do $$
declare np int; nh int; nb int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into np from properties;
  select count(*) into nh from hubs;
  select count(*) into nb from properties where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  reset role;
  if np <> 1 or nh <> 1 or nb <> 0 then
    raise exception 'FALHOU T5: casas=% hubs=% casaB=% (esperado 1,1,0)', np, nh, nb;
  end if;
  raise notice 'OK T5: dono A só vê a casa A';
end $$;

-- ===== T6: sem consentimento o dono só vê fugas ============================
do $$
declare n int; n_nao_fuga int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), count(*) filter (where event <> 'leak_detected') into n, n_nao_fuga from rsn_events;
  reset role;
  if n <> 1 or n_nao_fuga <> 0 then
    raise exception 'FALHOU T6: dono vê % eventos (% que não são fuga)', n, n_nao_fuga;
  end if;
  raise notice 'OK T6: dono só vê a fuga';
end $$;

-- ===== T7: o inquilino vê todos os eventos da sua casa ======================
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from rsn_events;
  reset role;
  if n <> 4 then raise exception 'FALHOU T7: inquilino vê % eventos (esperado 4)', n; end if;
  raise notice 'OK T7: inquilino vê os 4 eventos da casa A (e nenhum da B)';
end $$;

-- ===== T8: inquilino A1 autoriza movimento e som; created_by não se falsifica
do $$
declare por uuid; n_ev int; s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  -- tenta falsificar o autor (dono B)
  insert into consent_grants (property_id, category, reason, created_by) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'motion', 'teste', '44444444-4444-4444-4444-444444444444'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sound',  'teste', null);
  select created_by into por from consent_grants where category = 'motion';
  reset role;
  if por is distinct from '22222222-2222-2222-2222-222222222222' then
    raise exception 'FALHOU T8a: created_by = % (esperado o inquilino A1)', por;
  end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_ev from rsn_events;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if n_ev <> 2 then raise exception 'FALHOU T8b: dono vê % eventos (esperado 2: fuga+movimento)', n_ev; end if;
  if s is distinct from -40 then raise exception 'FALHOU T8c: dono não vê o som autorizado (%)', s; end if;
  raise notice 'OK T8: autor registado pela sessão; dono vê fuga+movimento e o som';
end $$;

-- ===== T9: só um consentimento ativo por casa+categoria =====================
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sound');
    reset role;
    raise exception 'FALHOU T9: aceitou um segundo consentimento ativo';
  exception when unique_violation then
    null;
  end;
  reset role;
  raise notice 'OK T9: segundo consentimento ativo recusado';
end $$;

-- ===== T10: o inquilino A2 retira o consentimento dado pelo A1 — prevalece ==
do $$
declare linhas int; por_dar uuid; por_retirar uuid; quando timestamptz; s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  set local role authenticated;
  update consent_grants set active = false
    where property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and category = 'sound' and active;
  get diagnostics linhas = row_count;
  reset role;
  if linhas <> 1 then raise exception 'FALHOU T10a: retirou % linhas (esperado 1)', linhas; end if;

  select created_by, revoked_by, revoked_at into por_dar, por_retirar, quando
    from consent_grants where category = 'sound';
  if por_dar is distinct from '22222222-2222-2222-2222-222222222222'
     or por_retirar is distinct from '33333333-3333-3333-3333-333333333333'
     or quando is null then
    raise exception 'FALHOU T10b: auditoria errada (deu=%, retirou=%, quando=%)', por_dar, por_retirar, quando;
  end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if s is not null then raise exception 'FALHOU T10c: dono ainda vê o som depois da retirada'; end if;
  raise notice 'OK T10: A2 retirou o que A1 deu; auditoria certa; dono deixa de ver o som';
end $$;

-- ===== T11: não se reativa, não se apaga, não se edita outras colunas =======
do $$
declare linhas int; ativo boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  set local role authenticated;
  -- reativar: a regra não deixa ver a linha retirada -> 0 linhas (ou recusa)
  begin
    update consent_grants set active = true where category = 'sound';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from consent_grants where category = 'sound';
    reset role;
    raise exception 'FALHOU T11a: conseguiu apagar um consentimento';
  exception when insufficient_privilege then null;
  end;
  begin
    update consent_grants set property_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where category = 'motion';
    reset role;
    raise exception 'FALHOU T11b: conseguiu editar outra coluna';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select active into ativo from consent_grants where category = 'sound';
  if ativo then raise exception 'FALHOU T11c: consentimento retirado voltou a ficar ativo'; end if;
  raise notice 'OK T11: sem reativar, sem apagar, sem editar outras colunas';
end $$;

-- ===== T12: o dono não cria nem retira consentimentos =======================
do $$
declare ativo boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'doorWindow');
    reset role;
    raise exception 'FALHOU T12a: o dono criou um consentimento';
  exception when insufficient_privilege then null;
  end;
  update consent_grants set active = false where category = 'motion';
  reset role;
  select active into ativo from consent_grants where category = 'motion';
  if not ativo then raise exception 'FALHOU T12b: o dono retirou um consentimento'; end if;
  raise notice 'OK T12: dono só lê consentimentos';
end $$;

-- ===== T13: consentimento expirado não conta ================================
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  insert into consent_grants (property_id, category, expires_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'doorWindow', now() - interval '1 hour');
  reset role;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from rsn_events;
  reset role;
  if n <> 2 then raise exception 'FALHOU T13: dono vê % eventos (esperado 2; porta expirada deve ficar escondida)', n; end if;
  raise notice 'OK T13: consentimento expirado não dá acesso';
end $$;

-- ===== T14: isolamento entre casas (dono B) =================================
do $$
declare n_ev int; n_cg int; n_a int; ok boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_ev from rsn_events;
  select count(*) into n_cg from consent_grants where property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into n_a from properties where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select has_consent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'motion') into ok;
  reset role;
  if n_ev <> 0 then raise exception 'FALHOU T14a: dono B vê % eventos (esperado 0)', n_ev; end if;
  if n_cg <> 0 or n_a <> 0 then raise exception 'FALHOU T14b: dono B vê dados da casa A'; end if;
  if ok then raise exception 'FALHOU T14c: has_consent revelou consentimento de outra casa'; end if;
  raise notice 'OK T14: dono B não vê nada da casa A';
end $$;

-- ===== T15: ninguém escreve em profiles / property_members ==================
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';
    reset role;
    raise exception 'FALHOU T15a: dono conseguiu mudar o próprio papel';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into property_members (user_id, property_id)
      values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    reset role;
    raise exception 'FALHOU T15b: dono conseguiu associar-se à casa B';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'OK T15: papel e associações só mudam pelo administrador';
end $$;

-- ===== T16: depois de retirar, um novo consentimento é uma nova linha =======
do $$
declare n int; s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sound');
  reset role;
  select count(*) into n from consent_grants where category = 'sound';
  if n <> 2 then raise exception 'FALHOU T16a: esperadas 2 linhas de som (histórico), há %', n; end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if s is distinct from -40 then raise exception 'FALHOU T16b: novo consentimento não deu acesso ao som'; end if;
  raise notice 'OK T16: histórico mantido; novo consentimento volta a dar acesso';
end $$;

select 'TODOS OS TESTES PASSARAM (lembra-te do ROLLBACK)' as resultado;
