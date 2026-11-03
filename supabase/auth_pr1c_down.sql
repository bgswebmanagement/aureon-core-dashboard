-- ---------------------------------------------------------------------------
-- Aureon Core — Auth PR 1c: REVERSÃO de auth_pr1c_private_schema.sql
-- Devolve as 6 funções ao esquema "public" (voltam a ficar expostas em /rpc).
-- ---------------------------------------------------------------------------

alter function private.is_admin() set search_path = public;
alter function private.my_role() set search_path = public;
alter function private.is_member(uuid) set search_path = public;
alter function private.has_consent(uuid, text) set search_path = public;
alter function private.can_see_satellite_activity(uuid, text[]) set search_path = public;
alter function private.can_see_alert_satellite(uuid) set search_path = public;

alter function private.is_admin() set schema public;
alter function private.my_role() set schema public;
alter function private.is_member(uuid) set schema public;
alter function private.has_consent(uuid, text) set schema public;
alter function private.can_see_satellite_activity(uuid, text[]) set schema public;
alter function private.can_see_alert_satellite(uuid) set schema public;

drop schema if exists private;
