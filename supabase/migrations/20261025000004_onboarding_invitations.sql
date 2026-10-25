-- Onboarding: robust org creation, invitation codes for joining an existing organization.

-- Backfill profiles for auth users created before the on_auth_user_created trigger existed.
insert into public.users (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.ensure_user_profile() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.users (id, email, display_name)
  select id, email, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
    from auth.users where id = v_uid
  on conflict (id) do nothing;
  return v_uid;
end $$;
revoke execute on function public.ensure_user_profile() from public, anon;

create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.ensure_user_profile();
  v_org uuid;
  v_slug text;
begin
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'organization name too short' using errcode = '22023'; end if;
  -- The app scopes each user to one organization; joining a second one requires an invitation flow change.
  if exists (select 1 from public.user_roles where user_id = v_uid) then
    raise exception 'already a member of an organization' using errcode = 'P0001', hint = 'already_member';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := left(coalesce(nullif(v_slug, ''), 'org'), 48) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  insert into public.organizations (name, slug) values (trim(p_name), v_slug) returning id into v_org;
  insert into public.user_roles (user_id, organization_id, role) values (v_uid, v_org, 'owner');
  perform public.provision_default_connectors(v_org);
  return v_org;
end $$;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  role text not null check (role in ('admin', 'recruiter', 'viewer')),
  max_uses int not null default 1 check (max_uses between 1 and 100),
  use_count int not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create trigger set_updated_at before update on public.organization_invitations for each row execute function public.set_updated_at();
create trigger audit after insert or update or delete on public.organization_invitations for each row execute function public.write_audit_log();

alter table public.organization_invitations enable row level security;
create policy invitations_admin_select on public.organization_invitations for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));
create policy invitations_admin_update on public.organization_invitations for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));
-- Inserts go through create_invitation() so the plaintext code is never stored.
revoke insert, delete on public.organization_invitations from anon, authenticated;
revoke select (code_hash) on public.organization_invitations from anon, authenticated;
revoke select on public.organization_invitations from anon, authenticated;
grant select (id, organization_id, code_hint, role, max_uses, use_count, expires_at, revoked_at, created_by, created_at, updated_at)
  on public.organization_invitations to authenticated;
revoke update on public.organization_invitations from anon, authenticated;
grant update (revoked_at) on public.organization_invitations to authenticated;

create or replace function public.invitation_code_hash(p_code text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;

create or replace function public.create_invitation(p_org uuid, p_role text default 'recruiter', p_valid_days int default 7, p_max_uses int default 1)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_raw text;
  v_code text;
begin
  if not public.has_org_role(p_org, array['owner', 'admin']) then
    raise exception 'only owners and admins can invite members' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'recruiter', 'viewer') then raise exception 'invalid role' using errcode = '22023'; end if;
  if p_role = 'admin' and not public.has_org_role(p_org, array['owner']) then
    raise exception 'only owners can invite admins' using errcode = '42501';
  end if;
  v_raw := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_code := 'BF-' || substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5) || '-' || substr(v_raw, 11, 5) || '-' || substr(v_raw, 16, 5);
  insert into public.organization_invitations (organization_id, code_hash, code_hint, role, max_uses, expires_at, created_by)
  values (p_org, public.invitation_code_hash(v_code), right(v_code, 5), p_role,
          least(greatest(coalesce(p_max_uses, 1), 1), 100),
          now() + make_interval(days => least(greatest(coalesce(p_valid_days, 7), 1), 30)),
          auth.uid());
  return v_code;
end $$;

create or replace function public.accept_invitation(p_code text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.ensure_user_profile();
  v_inv public.organization_invitations;
begin
  if exists (select 1 from public.user_roles where user_id = v_uid) then
    raise exception 'already a member of an organization' using errcode = 'P0001', hint = 'already_member';
  end if;
  select * into v_inv from public.organization_invitations
   where code_hash = public.invitation_code_hash(p_code)
   for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now() or v_inv.use_count >= v_inv.max_uses then
    -- One generic error so codes cannot be probed for state.
    raise exception 'invitation code is invalid or expired' using errcode = 'P0001', hint = 'invalid_invitation';
  end if;
  insert into public.user_roles (user_id, organization_id, role) values (v_uid, v_inv.organization_id, v_inv.role);
  update public.organization_invitations set use_count = use_count + 1 where id = v_inv.id;
  return v_inv.organization_id;
end $$;

revoke execute on function public.create_invitation(uuid, text, int, int) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.create_organization(text) from public, anon;
grant execute on function public.create_invitation(uuid, text, int, int) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.create_organization(text) to authenticated;
