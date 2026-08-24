-- ---------------------------------------------------------------------------
-- Aureon Core — inserir as 10 propriedades piloto + hubs + satélites de uma vez
--
-- Como usar:
-- 1. Edita as moradas/cidades abaixo (procura "PREENCHER").
-- 2. Se só tiveres MENOS de 10 propriedades prontas agora, podes apagar os
--    blocos das propriedades que ainda não tens (cada bloco está separado
--    por um comentário "-- Propriedade N").
-- 3. Cola tudo no SQL Editor da Supabase (o mesmo sítio onde correste o
--    schema.sql) e clica em "Run". Corre tudo de uma vez, não precisas de
--    copiar nenhum id à mão — os "hub_id"/"property_id" são resolvidos
--    automaticamente pelos (select ...) abaixo, com base no device_id/nome.
-- 4. Podes correr este script outra vez mais tarde para adicionar as
--    propriedades que faltarem — só apaga os blocos das que já inseriste,
--    para não duplicares.
-- ---------------------------------------------------------------------------

-- Propriedade 1
insert into properties (name, address, city) values
  ('Apartamento Piloto 1', 'PREENCHER MORADA 1', 'PREENCHER CIDADE 1');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0001', (select id from properties where name = 'Apartamento Piloto 1'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0001', (select id from hubs where device_id = 'AC-HUB-0001'), (select id from properties where name = 'Apartamento Piloto 1'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0002', (select id from hubs where device_id = 'AC-HUB-0001'), (select id from properties where name = 'Apartamento Piloto 1'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 2
insert into properties (name, address, city) values
  ('Apartamento Piloto 2', 'PREENCHER MORADA 2', 'PREENCHER CIDADE 2');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0002', (select id from properties where name = 'Apartamento Piloto 2'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0003', (select id from hubs where device_id = 'AC-HUB-0002'), (select id from properties where name = 'Apartamento Piloto 2'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0004', (select id from hubs where device_id = 'AC-HUB-0002'), (select id from properties where name = 'Apartamento Piloto 2'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 3
insert into properties (name, address, city) values
  ('Apartamento Piloto 3', 'PREENCHER MORADA 3', 'PREENCHER CIDADE 3');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0003', (select id from properties where name = 'Apartamento Piloto 3'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0005', (select id from hubs where device_id = 'AC-HUB-0003'), (select id from properties where name = 'Apartamento Piloto 3'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0006', (select id from hubs where device_id = 'AC-HUB-0003'), (select id from properties where name = 'Apartamento Piloto 3'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 4
insert into properties (name, address, city) values
  ('Apartamento Piloto 4', 'PREENCHER MORADA 4', 'PREENCHER CIDADE 4');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0004', (select id from properties where name = 'Apartamento Piloto 4'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0007', (select id from hubs where device_id = 'AC-HUB-0004'), (select id from properties where name = 'Apartamento Piloto 4'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0008', (select id from hubs where device_id = 'AC-HUB-0004'), (select id from properties where name = 'Apartamento Piloto 4'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 5
insert into properties (name, address, city) values
  ('Apartamento Piloto 5', 'PREENCHER MORADA 5', 'PREENCHER CIDADE 5');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0005', (select id from properties where name = 'Apartamento Piloto 5'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0009', (select id from hubs where device_id = 'AC-HUB-0005'), (select id from properties where name = 'Apartamento Piloto 5'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0010', (select id from hubs where device_id = 'AC-HUB-0005'), (select id from properties where name = 'Apartamento Piloto 5'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 6
insert into properties (name, address, city) values
  ('Apartamento Piloto 6', 'PREENCHER MORADA 6', 'PREENCHER CIDADE 6');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0006', (select id from properties where name = 'Apartamento Piloto 6'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0011', (select id from hubs where device_id = 'AC-HUB-0006'), (select id from properties where name = 'Apartamento Piloto 6'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0012', (select id from hubs where device_id = 'AC-HUB-0006'), (select id from properties where name = 'Apartamento Piloto 6'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 7
insert into properties (name, address, city) values
  ('Apartamento Piloto 7', 'PREENCHER MORADA 7', 'PREENCHER CIDADE 7');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0007', (select id from properties where name = 'Apartamento Piloto 7'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0013', (select id from hubs where device_id = 'AC-HUB-0007'), (select id from properties where name = 'Apartamento Piloto 7'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0014', (select id from hubs where device_id = 'AC-HUB-0007'), (select id from properties where name = 'Apartamento Piloto 7'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 8
insert into properties (name, address, city) values
  ('Apartamento Piloto 8', 'PREENCHER MORADA 8', 'PREENCHER CIDADE 8');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0008', (select id from properties where name = 'Apartamento Piloto 8'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0015', (select id from hubs where device_id = 'AC-HUB-0008'), (select id from properties where name = 'Apartamento Piloto 8'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0016', (select id from hubs where device_id = 'AC-HUB-0008'), (select id from properties where name = 'Apartamento Piloto 8'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 9
insert into properties (name, address, city) values
  ('Apartamento Piloto 9', 'PREENCHER MORADA 9', 'PREENCHER CIDADE 9');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0009', (select id from properties where name = 'Apartamento Piloto 9'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0017', (select id from hubs where device_id = 'AC-HUB-0009'), (select id from properties where name = 'Apartamento Piloto 9'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0018', (select id from hubs where device_id = 'AC-HUB-0009'), (select id from properties where name = 'Apartamento Piloto 9'), 'Porta de entrada', array['doorWindow']);

-- Propriedade 10
insert into properties (name, address, city) values
  ('Apartamento Piloto 10', 'PREENCHER MORADA 10', 'PREENCHER CIDADE 10');
insert into hubs (device_id, property_id, location) values
  ('AC-HUB-0010', (select id from properties where name = 'Apartamento Piloto 10'), 'Sala');
insert into satellites (device_id, hub_id, property_id, label, capabilities) values
  ('AC-RSN-0019', (select id from hubs where device_id = 'AC-HUB-0010'), (select id from properties where name = 'Apartamento Piloto 10'), 'Casa de banho - fuga + movimento', array['leak','motion']),
  ('AC-RSN-0020', (select id from hubs where device_id = 'AC-HUB-0010'), (select id from properties where name = 'Apartamento Piloto 10'), 'Porta de entrada', array['doorWindow']);

-- Confirmar o que ficou inserido:
select p.name, p.city, h.device_id as hub, s.device_id as satellite, s.capabilities
from properties p
join hubs h on h.property_id = p.id
join satellites s on s.hub_id = h.id
order by p.name, s.device_id;
