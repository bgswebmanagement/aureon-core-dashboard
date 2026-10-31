-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1: TESTES das regras (RLS), dono vs inquilino
--
-- COMO CORRER (nunca deixa nada gravado), numa só chamada:
--   begin;
--     <conteúdo de auth_pr1_up.sql>      -- só se a subida ainda não foi aplicada
--     <conteúdo deste ficheiro>          -- termina com a tabela de resultados
--   rollback;
-- Cada teste regista OK ou FALHOU (com o motivo) na tabela temporária
-- teste_resultados; a última linha do ficheiro mostra todos. Um teste que
-- falha não pára os seguintes (mas pode fazer falhar os que dependem dele).
-- Cria utilizadores e casas FALSOS dentro da transação; o rollback desfaz tudo.
--
-- Utilizadores: dono A = 1111…  inquilino A1 = 2222…  inquilino A2 = 3333…
--               dono B = 4444…  inquilino B1 = 5555…
-- Casas:        A = aaaa…   B = bbbb…
-- Satélites A:  S1 fuga+porta (87%)  S2 só fuga (55%)  S3 movimento (66%)
--               S4 movimento+porta (33%).   Satélite B: SB movimento (77%)
-- ---------------------------------------------------------------------------

create temp table teste_resultados (id serial primary key, teste text, resultado text);

-- ===== Preparação (como administrador da BD) ================================
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'dono-a@teste.invalid', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'inq-a1@teste.invalid', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'inq-a2@teste.invalid', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'dono-b@teste.invalid', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'inq-b1@teste.invalid', 'authenticated', 'authenticated');

insert into properties (id, name, address, city) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE Casa A', 'Rua A', 'Teste'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTE Casa B', 'Rua B', 'Teste');

insert into profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'tenant'),
  ('33333333-3333-3333-3333-333333333333', 'tenant'),
  ('44444444-4444-4444-4444-444444444444', 'owner'),
  ('55555555-5555-5555-5555-555555555555', 'tenant');

insert into property_members (user_id, property_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into hubs (id, device_id, property_id) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'TESTE-HUB-A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'TESTE-HUB-B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into satellites (device_id, hub_id, property_id, label, capabilities, battery, last_seen) values
  ('TESTE-S1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S1', '{leak,doorWindow}', 87, now() - interval '1 hour'),
  ('TESTE-S2', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S2', '{leak}', 55, now() - interval '1 hour'),
  ('TESTE-S3', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S3', '{motion}', 66, now() - interval '1 hour'),
  ('TESTE-S4', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S4', '{motion,doorWindow}', 33, now() - interval '1 hour'),
  ('TESTE-SB', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'SB', '{motion}', 77, now() - interval '1 hour');

insert into sensor_readings (hub_id, property_id, recorded_at, temperature, sound_dbfs, sound_max_dbfs, sound_loud_seconds) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 21, -40, -20, 3),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 22, -41, -21, 4);

insert into rsn_events (hub_id, property_id, node_id, event, recorded_at) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-S2', 'leak_detected', now()),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-S3', 'motion_detected', now()),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-S1', 'door_open', now()),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTE-S1', 'tipo_desconhecido', now()),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTE-SB', 'motion_detected', now());

-- Casa A: 11 alertas (4 sempre visíveis ao dono, 3 restritos, 4 "device")
insert into alerts (property_id, satellite_id, title, message, severity, tag, category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T leak', 'T', 'critico', 'x', 'leak'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T hum', 'T', 'aviso', 'x', 'humidity'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T temp', 'T', 'aviso', 'x', 'temperature'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T voc', 'T', 'aviso', 'x', 'voc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T motion', 'T', 'aviso', 'x', 'motion'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T door', 'T', 'aviso', 'x', 'doorWindow'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T sound', 'T', 'aviso', 'x', 'sound'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'T device sem satelite', 'T', 'aviso', 'x', 'device'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from satellites where device_id = 'TESTE-S2'), 'T device S2 (so fuga)', 'T', 'aviso', 'x', 'device'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from satellites where device_id = 'TESTE-S1'), 'T device S1 (porta)', 'T', 'aviso', 'x', 'device'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from satellites where device_id = 'TESTE-S4'), 'T device S4 (movimento+porta)', 'T', 'aviso', 'x', 'device'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'T leak B', 'T', 'critico', 'x', 'leak'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'T motion B', 'T', 'aviso', 'x', 'motion');

-- ===== T01: o dono NÃO lê a tabela sensor_readings diretamente =============
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from sensor_readings limit 1;
    reset role;
    raise exception 'o dono conseguiu ler sensor_readings diretamente';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T01 dono sem acesso direto a sensor_readings', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T01 dono sem acesso direto a sensor_readings', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T02: sem login (anon) não lê tabelas nem vistas ======================
do $$
declare t text;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  foreach t in array array['sensor_readings', 'sensor_readings_visible', 'satellites', 'satellites_visible'] loop
    begin
      execute format('select 1 from %I limit 1', t);
      reset role;
      raise exception 'anon leu %', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T02 anon sem acesso a leituras nem satélites', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T02 anon sem acesso a leituras nem satélites', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T03: o dono lê a vista, só da sua casa, SEM som ======================
do $$
declare n int; n_som int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), count(sound_dbfs) + count(sound_max_dbfs) + count(sound_loud_seconds)
    into n, n_som from sensor_readings_visible;
  reset role;
  if n <> 1 then raise exception 'dono vê % leituras (esperado 1)', n; end if;
  if n_som <> 0 then raise exception 'dono vê valores de som sem consentimento'; end if;
  insert into teste_resultados (teste, resultado) values ('T03 dono vê a vista (só a sua casa) sem som', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T03 dono vê a vista (só a sua casa) sem som', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T04: o inquilino vê o som ===========================================
do $$
declare s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if s is distinct from -40 then raise exception 'inquilino não vê o som (%)', s; end if;
  insert into teste_resultados (teste, resultado) values ('T04 inquilino vê o som', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T04 inquilino vê o som', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T05: o dono só vê a sua casa e o seu hub ============================
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
    raise exception 'casas=% hubs=% casaB=% (esperado 1,1,0)', np, nh, nb;
  end if;
  insert into teste_resultados (teste, resultado) values ('T05 dono A só vê a casa A', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T05 dono A só vê a casa A', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T06: sem consentimento o dono só vê fugas ===========================
do $$
declare n int; n_nao_fuga int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), count(*) filter (where event <> 'leak_detected') into n, n_nao_fuga from rsn_events;
  reset role;
  if n <> 1 or n_nao_fuga <> 0 then
    raise exception 'dono vê % eventos (% que não são fuga)', n, n_nao_fuga;
  end if;
  insert into teste_resultados (teste, resultado) values ('T06 dono sem consentimento só vê a fuga', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T06 dono sem consentimento só vê a fuga', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T07: o inquilino vê todos os eventos da sua casa ====================
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from rsn_events;
  reset role;
  if n <> 4 then raise exception 'inquilino vê % eventos (esperado 4)', n; end if;
  insert into teste_resultados (teste, resultado) values ('T07 inquilino vê os 4 eventos da sua casa', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T07 inquilino vê os 4 eventos da sua casa', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T08: o dono NÃO lê a tabela satellites diretamente ==================
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform 1 from satellites limit 1;
    reset role;
    raise exception 'o dono conseguiu ler satellites diretamente';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T08 dono sem acesso direto a satellites', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T08 dono sem acesso direto a satellites', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T09: satélites sem consentimento: atividade e bateria escondidas =====
do $$
declare n int;
        s2_seen int; s2_bat numeric; restritos_seen int;
        s1_bat numeric; s3_bat numeric; s4_bat numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*),
         count(last_seen) filter (where device_id = 'TESTE-S2'),
         max(battery) filter (where device_id = 'TESTE-S2'),
         count(last_seen) filter (where device_id in ('TESTE-S1', 'TESTE-S3', 'TESTE-S4')),
         max(battery) filter (where device_id = 'TESTE-S1'),
         max(battery) filter (where device_id = 'TESTE-S3'),
         max(battery) filter (where device_id = 'TESTE-S4')
    into n, s2_seen, s2_bat, restritos_seen, s1_bat, s3_bat, s4_bat
    from satellites_visible;
  reset role;
  if n <> 4 then raise exception 'dono vê % satélites (esperado 4, só da casa A)', n; end if;
  if s2_seen <> 1 or s2_bat <> 55 then
    raise exception 'satélite só de fuga devia aparecer exato (last_seen=%, bateria=%)', s2_seen, s2_bat;
  end if;
  if restritos_seen <> 0 then raise exception 'dono vê last_seen de satélites com movimento/porta'; end if;
  if s1_bat <> 80 or s3_bat <> 60 or s4_bat <> 30 then
    raise exception 'bateria devia estar arredondada à dezena (S1=%, S3=%, S4=%)', s1_bat, s3_bat, s4_bat;
  end if;
  insert into teste_resultados (teste, resultado) values ('T09 dono sem consentimento: last_seen escondido, bateria arredondada, só-fuga exato', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T09 dono sem consentimento: last_seen escondido, bateria arredondada, só-fuga exato', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T10: o inquilino vê tudo dos satélites, exato =======================
do $$
declare n int; n_seen int; s1_bat numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), count(last_seen), max(battery) filter (where device_id = 'TESTE-S1')
    into n, n_seen, s1_bat from satellites_visible;
  reset role;
  if n <> 4 or n_seen <> 4 or s1_bat <> 87 then
    raise exception 'inquilino: satélites=% last_seen=% bateriaS1=% (esperado 4,4,87)', n, n_seen, s1_bat;
  end if;
  insert into teste_resultados (teste, resultado) values ('T10 inquilino vê satélites com last_seen e bateria exatos', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T10 inquilino vê satélites com last_seen e bateria exatos', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T11: alertas sem consentimento — dono vê leak/humidade/temperatura/VOC,
--           não vê porta/movimento/som nem device de satélite restrito;
--           inquilino vê os 11 ===============================================
do $$
declare n_dono int; cats text; n_inq int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*), string_agg(category, ',' order by category) into n_dono, cats from alerts;
  reset role;
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_inq from alerts;
  reset role;
  -- esperado: leak, humidity, temperature, voc + device sem satélite + device do satélite só-fuga (S2)
  if cats is distinct from 'device,device,humidity,leak,temperature,voc' then
    raise exception 'dono vê categorias [%] (esperado device,device,humidity,leak,temperature,voc)', cats;
  end if;
  if n_inq <> 11 then raise exception 'inquilino vê % alertas (esperado 11)', n_inq; end if;
  insert into teste_resultados (teste, resultado) values ('T11 alertas sem consentimento: dono vê 6 (leak, humidade, temperatura, VOC, 2 device livres); inquilino vê 11', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T11 alertas sem consentimento: dono vê 6 (leak, humidade, temperatura, VOC, 2 device livres); inquilino vê 11', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T12: inquilino A1 autoriza movimento e som; autor e data não se falsificam
do $$
declare por uuid; quando timestamptz; n_ev int; s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  -- tenta falsificar autor (dono B) e data (ano 2000)
  insert into consent_grants (property_id, category, reason, created_by, granted_at) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'motion', 'teste', '44444444-4444-4444-4444-444444444444', '2000-01-01'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sound',  'teste', null, null);
  select created_by, granted_at into por, quando from consent_grants where category = 'motion';
  reset role;
  if por is distinct from '22222222-2222-2222-2222-222222222222' then
    raise exception 'created_by = % (esperado o inquilino A1)', por;
  end if;
  if quando is distinct from now() then raise exception 'granted_at = % (esperado now())', quando; end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_ev from rsn_events;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if n_ev <> 2 then raise exception 'dono vê % eventos (esperado 2: fuga+movimento)', n_ev; end if;
  if s is distinct from -40 then raise exception 'dono não vê o som autorizado (%)', s; end if;
  insert into teste_resultados (teste, resultado) values ('T12 A1 autoriza; autor registado; dono vê fuga+movimento e som', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T12 A1 autoriza; autor registado; dono vê fuga+movimento e som', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T13: granted_at é sempre now(), mesmo que o cliente envie outra data ==
do $$
declare quando timestamptz;
begin
  perform set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
  set local role authenticated;
  insert into consent_grants (property_id, category, granted_at)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sound', '2000-01-01 00:00:00+00');
  select granted_at into quando from consent_grants where property_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  reset role;
  if quando is distinct from now() then raise exception 'granted_at guardado = % (esperado now())', quando; end if;
  insert into teste_resultados (teste, resultado) values ('T13 granted_at forçado a now() num INSERT de inquilino', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T13 granted_at forçado a now() num INSERT de inquilino', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T14: consentimento de movimento abre só os satélites só-de-movimento =
do $$
declare s3_seen int; s3_bat numeric; s1_seen int; s4_seen int; s1_bat numeric; s4_bat numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(last_seen) filter (where device_id = 'TESTE-S3'),
         max(battery) filter (where device_id = 'TESTE-S3'),
         count(last_seen) filter (where device_id = 'TESTE-S1'),
         count(last_seen) filter (where device_id = 'TESTE-S4'),
         max(battery) filter (where device_id = 'TESTE-S1'),
         max(battery) filter (where device_id = 'TESTE-S4')
    into s3_seen, s3_bat, s1_seen, s4_seen, s1_bat, s4_bat from satellites_visible;
  reset role;
  if s3_seen <> 1 or s3_bat <> 66 then raise exception 'S3 (movimento) devia abrir exato (seen=%, bat=%)', s3_seen, s3_bat; end if;
  if s1_seen <> 0 or s1_bat <> 80 then raise exception 'S1 (porta) devia continuar escondido (seen=%, bat=%)', s1_seen, s1_bat; end if;
  if s4_seen <> 0 or s4_bat <> 30 then raise exception 'S4 (movimento+porta) precisa das DUAS autorizações (seen=%, bat=%)', s4_seen, s4_bat; end if;
  insert into teste_resultados (teste, resultado) values ('T14 consentimento de movimento: abre S3; S1 e S4 continuam escondidos', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T14 consentimento de movimento: abre S3; S1 e S4 continuam escondidos', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T15: só um consentimento ativo por casa+categoria ====================
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sound');
    reset role;
    raise exception 'aceitou um segundo consentimento ativo';
  exception when unique_violation then
    null;
  end;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T15 segundo consentimento ativo recusado', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T15 segundo consentimento ativo recusado', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T16: o inquilino A2 retira o que o A1 deu — a retirada prevalece =====
do $$
declare linhas int; por_dar uuid; por_retirar uuid; quando timestamptz; s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  set local role authenticated;
  update consent_grants set active = false
    where property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and category = 'sound' and active;
  get diagnostics linhas = row_count;
  reset role;
  if linhas <> 1 then raise exception 'retirou % linhas (esperado 1)', linhas; end if;

  select created_by, revoked_by, revoked_at into por_dar, por_retirar, quando
    from consent_grants where category = 'sound' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if por_dar is distinct from '22222222-2222-2222-2222-222222222222'
     or por_retirar is distinct from '33333333-3333-3333-3333-333333333333'
     or quando is null then
    raise exception 'auditoria errada (deu=%, retirou=%, quando=%)', por_dar, por_retirar, quando;
  end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if s is not null then raise exception 'dono ainda vê o som depois da retirada'; end if;
  insert into teste_resultados (teste, resultado) values ('T16 A2 retira o que A1 deu; auditoria certa; dono perde o som', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T16 A2 retira o que A1 deu; auditoria certa; dono perde o som', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T17: não se reativa, não se apaga, não se edita outras colunas =======
do $$
declare ativo boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update consent_grants set active = true
      where category = 'sound' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from consent_grants where category = 'sound';
    reset role;
    raise exception 'conseguiu apagar um consentimento';
  exception when insufficient_privilege then null;
  end;
  begin
    update consent_grants set property_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where category = 'motion';
    reset role;
    raise exception 'conseguiu editar outra coluna';
  exception when insufficient_privilege then null;
  end;
  reset role;
  select active into ativo from consent_grants
    where category = 'sound' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if ativo then raise exception 'consentimento retirado voltou a ficar ativo'; end if;
  insert into teste_resultados (teste, resultado) values ('T17 sem reativar, sem apagar, sem editar outras colunas', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T17 sem reativar, sem apagar, sem editar outras colunas', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T18: o dono não cria nem retira consentimentos =======================
do $$
declare ativo boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'doorWindow');
    reset role;
    raise exception 'o dono criou um consentimento';
  exception when insufficient_privilege then null;
  end;
  update consent_grants set active = false where category = 'motion';
  reset role;
  select active into ativo from consent_grants
    where category = 'motion' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if not ativo then raise exception 'o dono retirou um consentimento'; end if;
  insert into teste_resultados (teste, resultado) values ('T18 dono só lê consentimentos', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T18 dono só lê consentimentos', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T19: consentimento de porta EXPIRADO não dá acesso (eventos nem satélites)
do $$
declare n int; s1_seen int; s4_seen int;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  insert into consent_grants (property_id, category, expires_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'doorWindow', now() - interval '1 hour');
  reset role;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from rsn_events;
  select count(last_seen) filter (where device_id = 'TESTE-S1'),
         count(last_seen) filter (where device_id = 'TESTE-S4')
    into s1_seen, s4_seen from satellites_visible;
  reset role;
  if n <> 2 then raise exception 'dono vê % eventos (esperado 2; porta expirada deve ficar escondida)', n; end if;
  if s1_seen <> 0 or s4_seen <> 0 then raise exception 'consentimento expirado abriu last_seen de S1/S4'; end if;
  insert into teste_resultados (teste, resultado) values ('T19 consentimento de porta expirado não dá acesso', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T19 consentimento de porta expirado não dá acesso', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T20: porta válida abre S1 e S4; ao retirar, voltam a esconder-se =====
do $$
declare n int; s1_seen int; s4_seen int; s1_bat numeric; s4_bat numeric; s1_depois int; s4_depois int; n_depois int;
begin
  -- (como administrador) torna o consentimento de porta válido
  update consent_grants set expires_at = null
    where category = 'doorWindow' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from rsn_events;
  select count(last_seen) filter (where device_id = 'TESTE-S1'),
         count(last_seen) filter (where device_id = 'TESTE-S4'),
         max(battery) filter (where device_id = 'TESTE-S1'),
         max(battery) filter (where device_id = 'TESTE-S4')
    into s1_seen, s4_seen, s1_bat, s4_bat from satellites_visible;
  reset role;
  if n <> 3 then raise exception 'dono vê % eventos (esperado 3: fuga+movimento+porta)', n; end if;
  if s1_seen <> 1 or s4_seen <> 1 or s1_bat <> 87 or s4_bat <> 33 then
    raise exception 'com porta+movimento autorizados S1/S4 deviam abrir (S1 seen=% bat=%, S4 seen=% bat=%)', s1_seen, s1_bat, s4_seen, s4_bat;
  end if;

  -- o inquilino retira a porta
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  update consent_grants set active = false
    where category = 'doorWindow' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and active;
  reset role;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_depois from rsn_events;
  select count(last_seen) filter (where device_id = 'TESTE-S1'),
         count(last_seen) filter (where device_id = 'TESTE-S4')
    into s1_depois, s4_depois from satellites_visible;
  reset role;
  if n_depois <> 2 or s1_depois <> 0 or s4_depois <> 0 then
    raise exception 'depois de retirar a porta: eventos=% S1=% S4=% (esperado 2,0,0)', n_depois, s1_depois, s4_depois;
  end if;
  insert into teste_resultados (teste, resultado) values ('T20 porta válida abre S1/S4 (exige também movimento); retirar volta a esconder', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T20 porta válida abre S1/S4 (exige também movimento); retirar volta a esconder', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T21: isolamento entre casas (dono B) =================================
do $$
declare n_ev int; n_cg int; n_a int; ok boolean; n_sat int; n_sat_a int; sb_seen int; n_al int; n_al_b int;
begin
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n_ev from rsn_events;
  select count(*) into n_cg from consent_grants where property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into n_a from properties where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select has_consent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'motion') into ok;
  select count(*), count(*) filter (where property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), count(last_seen)
    into n_sat, n_sat_a, sb_seen from satellites_visible;
  select count(*) into n_al from alerts where property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into n_al_b from alerts;
  reset role;
  if n_ev <> 0 then raise exception 'dono B vê % eventos (esperado 0)', n_ev; end if;
  if n_cg <> 0 or n_a <> 0 then raise exception 'dono B vê dados da casa A'; end if;
  if ok then raise exception 'has_consent revelou consentimento de outra casa'; end if;
  if n_sat <> 1 or n_sat_a <> 0 then raise exception 'dono B vê % satélites (% da casa A); esperado 1 e 0', n_sat, n_sat_a; end if;
  if sb_seen <> 0 then raise exception 'dono B vê last_seen do seu satélite de movimento sem consentimento'; end if;
  if n_al <> 0 then raise exception 'dono B vê % alertas da casa A', n_al; end if;
  if n_al_b <> 1 then raise exception 'dono B vê % alertas (esperado 1: o leak da casa B; o de movimento fica escondido)', n_al_b; end if;
  insert into teste_resultados (teste, resultado) values ('T21 dono B não vê nada da casa A', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T21 dono B não vê nada da casa A', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T22: ninguém escreve em profiles / property_members ==================
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';
    reset role;
    raise exception 'dono conseguiu mudar o próprio papel';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into property_members (user_id, property_id)
      values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    reset role;
    raise exception 'dono conseguiu associar-se à casa B';
  exception when insufficient_privilege then null;
  end;
  reset role;
  insert into teste_resultados (teste, resultado) values ('T22 papel e associações só mudam pelo administrador', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T22 papel e associações só mudam pelo administrador', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T23: depois de retirar, um novo consentimento é uma nova linha =======
do $$
declare n int; s numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sound');
  reset role;
  select count(*) into n from consent_grants
    where category = 'sound' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 2 then raise exception 'esperadas 2 linhas de som (histórico), há %', n; end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select sound_dbfs into s from sensor_readings_visible;
  reset role;
  if s is distinct from -40 then raise exception 'novo consentimento não deu acesso ao som'; end if;
  insert into teste_resultados (teste, resultado) values ('T23 histórico mantido; novo consentimento volta a dar acesso', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T23 histórico mantido; novo consentimento volta a dar acesso', 'FALHOU: ' || sqlerrm);
end $$;

-- Estado nesta altura (casa A): movimento ATIVO, som ATIVO, porta retirada.

-- ===== T24: com movimento e som autorizados, o dono vê esses alertas; porta não
do $$
declare cats text;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select string_agg(category, ',' order by category) into cats from alerts;
  reset role;
  if cats is distinct from 'device,device,humidity,leak,motion,sound,temperature,voc' then
    raise exception 'dono vê [%] (esperado device,device,humidity,leak,motion,sound,temperature,voc)', cats;
  end if;
  insert into teste_resultados (teste, resultado) values ('T24 alertas com movimento+som autorizados: aparecem; porta e device S1/S4 continuam escondidos', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T24 alertas com movimento+som autorizados: aparecem; porta e device S1/S4 continuam escondidos', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T25: com a porta também autorizada, abrem o alerta de porta e os device S1 e S4
do $$
declare cats text;
begin
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  set local role authenticated;
  insert into consent_grants (property_id, category) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'doorWindow');
  reset role;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select string_agg(category, ',' order by category) into cats from alerts;
  reset role;
  if cats is distinct from 'device,device,device,device,doorWindow,humidity,leak,motion,sound,temperature,voc' then
    raise exception 'dono vê [%] (esperado os 11 alertas)', cats;
  end if;
  insert into teste_resultados (teste, resultado) values ('T25 com porta autorizada: abre alerta de porta e device S1/S4 (segue a regra do last_seen)', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T25 com porta autorizada: abre alerta de porta e device S1/S4 (segue a regra do last_seen)', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T26: consentimento de porta expirado volta a esconder-os =============
do $$
declare cats text;
begin
  -- (como administrador) faz expirar o consentimento de porta
  update consent_grants set expires_at = now() - interval '1 hour'
    where category = 'doorWindow' and property_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and active;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select string_agg(category, ',' order by category) into cats from alerts;
  reset role;
  if cats is distinct from 'device,device,humidity,leak,motion,sound,temperature,voc' then
    raise exception 'dono vê [%] depois de a porta expirar (esperado 8 alertas, sem porta nem device S1/S4)', cats;
  end if;
  insert into teste_resultados (teste, resultado) values ('T26 consentimento de porta expirado volta a esconder alerta de porta e device S1/S4', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T26 consentimento de porta expirado volta a esconder alerta de porta e device S1/S4', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T27: nem dono nem inquilino criam alertas pela API ===================
do $$
declare uid text;
begin
  foreach uid in array array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      insert into alerts (property_id, title, message, severity, tag, category)
        values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'falso', 'falso', 'aviso', 'x', 'leak');
      reset role;
      raise exception 'utilizador % criou um alerta', uid;
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  end loop;
  insert into teste_resultados (teste, resultado) values ('T27 dono e inquilino não criam alertas', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T27 dono e inquilino não criam alertas', 'FALHOU: ' || sqlerrm);
end $$;

-- ===== T28: ninguém com sessão escreve nas vistas nem nas tabelas de leitura
--           (exige auth_pr1b_privileges.sql aplicado) =========================
do $$
declare uid text; p constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        h constant uuid := 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'; n int;
begin
  foreach uid in array array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      update satellites_visible set label = 'HACKED' where property_id = p;
      reset role;
      raise exception '% alterou satellites_visible', uid;
    exception when insufficient_privilege then null;
    end;
    set local role authenticated;
    begin
      insert into sensor_readings_visible (hub_id, property_id, recorded_at, temperature) values (h, p, now(), 99);
      reset role;
      raise exception '% inseriu em sensor_readings_visible', uid;
    exception when insufficient_privilege then null;
    end;
    set local role authenticated;
    begin
      delete from sensor_readings_visible where property_id = p;
      reset role;
      raise exception '% apagou de sensor_readings_visible', uid;
    exception when insufficient_privilege then null;
    end;
    set local role authenticated;
    begin
      delete from satellites_visible where property_id = p;
      reset role;
      raise exception '% apagou de satellites_visible', uid;
    exception when insufficient_privilege then null;
    end;
    set local role authenticated;
    begin
      insert into sensor_readings (hub_id, property_id, recorded_at, temperature) values (h, p, now(), 99);
      reset role;
      raise exception '% inseriu diretamente em sensor_readings', uid;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  select count(*) into n from satellites where label = 'HACKED';
  if n <> 0 then raise exception 'há % satélites alterados', n; end if;
  insert into teste_resultados (teste, resultado) values ('T28 dono e inquilino não escrevem nas vistas nem nas tabelas de leitura', 'OK');
exception when others then
  insert into teste_resultados (teste, resultado) values ('T28 dono e inquilino não escrevem nas vistas nem nas tabelas de leitura', 'FALHOU: ' || sqlerrm);
end $$;

select teste, resultado from teste_resultados order by id;
