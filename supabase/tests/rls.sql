-- Database access-policy tests. Run: pnpm db:test (requires `supabase start` and seed data).
-- Fails with an exception on the first broken expectation.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'RLS TEST FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Second tenant for isolation tests.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'other@tenant.local', '', now(), now(), now());
insert into public.organizations (id, name, slug) values ('00000000-0000-4000-8000-000000000002', 'Other Tenant', 'other-tenant');
insert into public.user_roles (user_id, organization_id, role) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002', 'owner');
insert into public.job_requirements (organization_id, title) values ('00000000-0000-4000-8000-000000000002', 'Other tenant secret job');

set local role authenticated;

-- Demo owner
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check((select count(*) from public.job_requirements where title = 'Other tenant secret job') = 0, 'owner cannot read another tenant''s requirements');
select pg_temp.check((select count(*) from public.job_requirements) > 0, 'owner reads own requirements');
select pg_temp.check((select count(*) from public.consultants) > 0, 'owner reads consultants');
select pg_temp.check((select count(*) from public.audit_logs) > 0, 'owner reads audit log');

do $$ begin
  insert into public.job_requirements (organization_id, title) values ('00000000-0000-4000-8000-000000000002', 'cross-tenant write');
  raise exception 'RLS TEST FAILED: cross-tenant insert succeeded';
exception when insufficient_privilege then raise notice 'ok - cross-tenant insert blocked';
end $$;

with u as (update public.job_requirements set title = 'hacked' where organization_id = '00000000-0000-4000-8000-000000000002' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'cross-tenant update affects no rows');

do $$ begin
  perform public.search_requirements('00000000-0000-4000-8000-000000000002');
  raise exception 'RLS TEST FAILED: search across tenants allowed';
exception when insufficient_privilege then raise notice 'ok - search_requirements rejects non-members';
end $$;

do $$ begin
  perform public.dashboard_stats('00000000-0000-4000-8000-000000000002');
  raise exception 'RLS TEST FAILED: dashboard across tenants allowed';
exception when insufficient_privilege then raise notice 'ok - dashboard_stats rejects non-members';
end $$;

-- Demo viewer: read-only, no consultant data, no audit log.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2');
select pg_temp.check((select count(*) from public.job_requirements) > 0, 'viewer reads requirements');
select pg_temp.check((select count(*) from public.consultants) = 0, 'viewer cannot read consultants');
select pg_temp.check((select count(*) from public.audit_logs) = 0, 'viewer cannot read audit log');
do $$ begin
  insert into public.job_requirements (organization_id, title) values ('00000000-0000-4000-8000-000000000001', 'viewer write');
  raise exception 'RLS TEST FAILED: viewer insert succeeded';
exception when insufficient_privilege then raise notice 'ok - viewer insert blocked';
end $$;
with u as (update public.job_requirements set status = 'closed' where organization_id = '00000000-0000-4000-8000-000000000001' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'viewer update affects no rows');
do $$ begin
  insert into public.user_roles (user_id, organization_id, role) values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'admin');
  raise exception 'RLS TEST FAILED: viewer escalated own role';
exception when insufficient_privilege or unique_violation then raise notice 'ok - viewer cannot escalate role';
end $$;

-- Mailbox token references are never readable by app users.
do $$ begin
  perform token_secret_id from public.connected_mailboxes;
  raise exception 'RLS TEST FAILED: token_secret_id readable';
exception when insufficient_privilege then raise notice 'ok - token_secret_id column not readable';
end $$;

-- Anonymous users see nothing.
set local role anon;
select pg_temp.check((select count(*) from public.job_requirements) = 0, 'anon reads nothing');

rollback;
