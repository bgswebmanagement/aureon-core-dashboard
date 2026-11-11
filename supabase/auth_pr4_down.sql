-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 4: REVERSÃO de auth_pr4_up.sql
-- *** Reversão do auth_pr4_up.sql (partes A e C aplicadas; só usar se for mesmo preciso).
--
-- Recria as 10 regras antigas exatamente como estavam na base de dados real
-- (copiadas de pg_policies). ATENÇÃO: reverter volta a abrir a porta descrita em
-- auth_pr4_up.sql (acesso por owner_id sem respeitar o consentimento). Só usar
-- se for mesmo preciso.
-- ---------------------------------------------------------------------------

-- PARTE B (só se tiver sido aplicada): voltar a criar as colunas, vazias
-- alter table properties add column if not exists owner_id uuid references auth.users(id);
-- alter table profiles   add column if not exists property_id uuid references properties(id);

-- PARTE C (foi aplicada): devolver a leitura de todas as colunas
grant select on rsn_events to authenticated;

-- PARTE A: recriar as regras antigas
create policy "owners manage their properties" on properties
  for all using (owner_id = auth.uid());

create policy "tenants read their property" on properties
  for select using (
    id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "owners read their tenants" on tenants
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
  );

create policy "scoped hubs" on hubs
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped satellites" on satellites
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped sensor_readings" on sensor_readings
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped rsn_events" on rsn_events
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "scoped alerts" on alerts
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
    or property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );

create policy "owners read consent grants for their properties" on consent_grants
  for select using (
    property_id in (select id from properties where owner_id = auth.uid())
  );

create policy "tenants manage their consent grants" on consent_grants
  for all using (
    property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  ) with check (
    property_id in (select property_id from profiles where id = auth.uid() and role = 'tenant')
  );
