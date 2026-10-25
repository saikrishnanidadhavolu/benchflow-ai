-- Onboarding and membership tests: users with and without an organization.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'ONBOARDING TEST FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Two new auth users with no membership. One has no public.users profile (simulates pre-trigger accounts).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'new1@test.local', '', now(), now(), now()),
       ('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'new2@test.local', '', now(), now(), now());
delete from public.users where id = '00000000-0000-4000-8000-0000000000c2';

set local role authenticated;

-- User without membership: sees no organization data.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
select pg_temp.check((select count(*) from public.user_roles) = 0, 'new user has no membership rows');
select pg_temp.check((select count(*) from public.organizations) = 0, 'new user sees no organizations');
select pg_temp.check((select count(*) from public.job_requirements) = 0, 'new user sees no requirements');
do $$ begin
  perform public.create_invitation('00000000-0000-4000-8000-000000000001', 'viewer');
  raise exception 'ONBOARDING TEST FAILED: non-member created an invitation';
exception when insufficient_privilege then raise notice 'ok - non-member cannot create invitations';
end $$;
do $$ begin
  insert into public.user_roles (user_id, organization_id, role) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'viewer');
  raise exception 'ONBOARDING TEST FAILED: user added themselves to an org';
exception when insufficient_privilege then raise notice 'ok - user cannot insert their own membership';
end $$;

-- Create an organization: membership persisted as owner, connectors provisioned.
select pg_temp.check(public.create_organization('New Staffing Co') is not null, 'create_organization returns an id');
select pg_temp.check((select role from public.user_roles where user_id = '00000000-0000-4000-8000-0000000000c1') = 'owner', 'creator becomes owner');
select pg_temp.check((select count(*) from public.organizations) = 1, 'owner sees exactly their organization');
select pg_temp.check((select count(*) from public.source_connectors) = 9, 'default connectors provisioned');
select pg_temp.check((select count(*) from public.job_requirements) = 0, 'new organization starts empty (no demo data)');
do $$ begin
  perform public.create_organization('Second Org');
  raise exception 'ONBOARDING TEST FAILED: member created a second org';
exception when raise_exception then raise notice 'ok - existing member cannot create another organization';
end $$;

-- Owner invites; a user with no profile row accepts and joins with the invited role.
create temp table invite(code text) on commit drop;
grant all on invite to authenticated;
insert into invite select public.create_invitation((select id from public.organizations), 'viewer', 7, 1);
select pg_temp.check((select code from invite) ~ '^BF-[0-9A-F]{5}(-[0-9A-F]{5}){3}$', 'invitation code format');
select pg_temp.check((select count(*) from public.organization_invitations) = 1, 'owner sees the invitation');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000c2');
do $$ begin
  perform public.accept_invitation('BF-00000-00000-00000-00000');
  raise exception 'ONBOARDING TEST FAILED: bogus code accepted';
exception when raise_exception then raise notice 'ok - invalid code rejected';
end $$;
select pg_temp.check(public.accept_invitation(lower((select code from invite))) is not null, 'invitation accepted (case-insensitive)');
select pg_temp.check((select role from public.user_roles where user_id = '00000000-0000-4000-8000-0000000000c2') = 'viewer', 'joiner gets the invited role');
select pg_temp.check((select count(*) from public.organizations) = 1, 'joiner can read the organization');
select pg_temp.check((select count(*) from public.organization_invitations) = 0, 'viewer cannot list invitations');

-- Single-use: a third user cannot reuse the code.
reset role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'new3@test.local', '', now(), now(), now());
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
do $$ begin
  perform public.accept_invitation((select code from invite));
  raise exception 'ONBOARDING TEST FAILED: used code accepted twice';
exception when raise_exception then raise notice 'ok - used invitation cannot be reused';
end $$;

-- Expired invitation is rejected.
reset role;
update public.organization_invitations set max_uses = 5, expires_at = now() - interval '1 minute';
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c3');
do $$ begin
  perform public.accept_invitation((select code from invite));
  raise exception 'ONBOARDING TEST FAILED: expired code accepted';
exception when raise_exception then raise notice 'ok - expired invitation rejected';
end $$;

-- Code hashes are never readable.
select pg_temp.as_user('00000000-0000-4000-8000-0000000000c1');
do $$ begin
  perform code_hash from public.organization_invitations;
  raise exception 'ONBOARDING TEST FAILED: code_hash readable';
exception when insufficient_privilege then raise notice 'ok - code_hash not readable';
end $$;

-- Anonymous callers cannot onboard.
set local role anon;
do $$ begin
  perform public.create_organization('Anon Org');
  raise exception 'ONBOARDING TEST FAILED: anon created org';
exception when insufficient_privilege then raise notice 'ok - anon cannot create organizations';
end $$;

rollback;
