-- BenchFlow AI core schema: tenancy, roles, requirements, sources, vendors, consultants, search, audit.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'recruiter', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index user_roles_org_idx on public.user_roles (organization_id);

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where organization_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where organization_id = p_org and user_id = auth.uid() and role = any (p_roles)
  );
$$;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Reference data: skills and synonyms (organization_id null = global)
-- ---------------------------------------------------------------------------
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index skills_name_uniq on public.skills (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.skill_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index skill_aliases_uniq on public.skill_aliases (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(alias));

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  category text not null default 'staffing'
    check (category in ('staffing', 'prime_vendor', 'implementation_partner', 'end_client', 'consulting', 'other')),
  website text,
  vendor_portal_url text,
  supplier_registration_url text,
  careers_url text,
  contact jsonb not null default '{}'::jsonb,
  specializations text[] not null default '{}',
  coverage text[] not null default '{}',
  relationship_type text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review')),
  last_verified_at timestamptz,
  info_source text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendors_org_name_uniq on public.vendors (organization_id, lower(name));
create index vendors_name_trgm on public.vendors using gin (name extensions.gin_trgm_ops);
create index vendors_org_category_idx on public.vendors (organization_id, category);

create table public.vendor_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  related_vendor_id uuid not null references public.vendors(id) on delete cascade,
  relationship_type text not null
    check (relationship_type in ('prime_vendor_for', 'implementation_partner_for', 'subvendor_of', 'other')),
  evidence text,
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vendor_id <> related_vendor_id),
  unique (vendor_id, related_vendor_id, relationship_type)
);

-- ---------------------------------------------------------------------------
-- Mailboxes, connectors, sync runs
-- ---------------------------------------------------------------------------
create table public.connected_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  label text not null check (label in ('prohires', 'work', 'personal', 'other')),
  provider text not null check (provider in ('gmail', 'microsoft', 'imap')),
  email_address text not null,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'error', 'reauth_required', 'paused')),
  scopes text[] not null default '{}',
  -- Reference to an encrypted secret (Supabase Vault). Tokens themselves never live in this table.
  token_secret_id uuid,
  watch_rules jsonb not null default '{"labels": [], "folders": [], "senders": [], "exclude_senders": [], "keywords": []}'::jsonb,
  sync_interval_minutes int not null default 15 check (sync_interval_minutes between 5 and 1440),
  history_from date,
  retention_days int check (retention_days is null or retention_days > 0),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email_address)
);
-- token_secret_id is only readable/writable by the service role (worker).
revoke select, insert, update on public.connected_mailboxes from anon, authenticated;
grant select (id, organization_id, owner_user_id, label, provider, email_address, status, scopes, watch_rules, sync_interval_minutes, history_from, retention_days, last_synced_at, last_error, created_at, updated_at) on public.connected_mailboxes to authenticated;
grant insert (owner_user_id, organization_id, label, provider, email_address, status, scopes, watch_rules, sync_interval_minutes, history_from, retention_days) on public.connected_mailboxes to authenticated;
grant update (owner_user_id, organization_id, label, provider, email_address, status, scopes, watch_rules, sync_interval_minutes, history_from, retention_days) on public.connected_mailboxes to authenticated;

create table public.source_connectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_key text not null,
  display_name text not null,
  enabled boolean not null default false,
  auth_status text not null default 'not_configured'
    check (auth_status in ('not_configured', 'configured', 'connected', 'error', 'no_authorized_access')),
  config jsonb not null default '{}'::jsonb,
  search_config jsonb not null default '{}'::jsonb,
  token_secret_id uuid,
  sync_frequency_minutes int not null default 60 check (sync_frequency_minutes between 15 and 10080),
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, connector_key)
);
-- token_secret_id is only readable/writable by the service role (worker).
revoke select, insert, update on public.source_connectors from anon, authenticated;
grant select (id, organization_id, connector_key, display_name, enabled, auth_status, config, search_config, sync_frequency_minutes, last_success_at, last_error, created_at, updated_at) on public.source_connectors to authenticated;
grant insert (organization_id, connector_key, display_name, enabled, auth_status, config, search_config, sync_frequency_minutes) on public.source_connectors to authenticated;
grant update (organization_id, connector_key, display_name, enabled, auth_status, config, search_config, sync_frequency_minutes) on public.source_connectors to authenticated;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_id uuid references public.connected_mailboxes(id) on delete cascade,
  connector_id uuid references public.source_connectors(id) on delete cascade,
  kind text not null check (kind in ('mailbox', 'connector', 'csv_import', 'manual')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count int not null default 0,
  created_count int not null default 0,
  duplicate_count int not null default 0,
  error_count int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sync_runs_org_started_idx on public.sync_runs (organization_id, started_at desc);

-- Immutable raw inputs (email message, job-board payload, CSV row, manual entry).
create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('email', 'job_board', 'csv', 'manual', 'portal', 'document')),
  source_name text not null,
  mailbox_id uuid references public.connected_mailboxes(id) on delete set null,
  connector_id uuid references public.source_connectors(id) on delete set null,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  external_id text,
  message_id text,
  thread_id text,
  sender text,
  subject text,
  received_at timestamptz,
  canonical_url text,
  raw_text text,
  raw_payload jsonb,
  content_hash text,
  classification text check (classification in ('job_requirement', 'update', 'rejection', 'interview_request', 'irrelevant', 'other')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'failed', 'skipped')),
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index source_records_external_uniq on public.source_records (organization_id, source_type, source_name, external_id) where external_id is not null;
create index source_records_hash_idx on public.source_records (organization_id, content_hash);

-- ---------------------------------------------------------------------------
-- Job requirements
-- ---------------------------------------------------------------------------
create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(title) between 1 and 300),
  description text,
  ai_summary text,
  skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  years_experience_min numeric(4,1) check (years_experience_min is null or years_experience_min >= 0),
  years_experience_max numeric(4,1) check (years_experience_max is null or years_experience_max >= 0),
  location_city text,
  location_state text check (location_state is null or location_state ~ '^[A-Z]{2}$'),
  location_country text default 'US',
  work_arrangement text check (work_arrangement in ('remote', 'hybrid', 'onsite')),
  employment_type text check (employment_type in ('contract', 'contract_to_hire', 'full_time', 'part_time')),
  rate_min numeric(12,2) check (rate_min is null or rate_min >= 0),
  rate_max numeric(12,2) check (rate_max is null or rate_max >= 0),
  rate_unit text check (rate_unit in ('hour', 'day', 'month', 'year')),
  currency text default 'USD' check (currency ~ '^[A-Z]{3}$'),
  tax_terms text[] not null default '{}' check (tax_terms <@ array['C2C', 'W2', '1099']::text[]),
  visa_requirements text[] not null default '{}',
  source_job_id text,
  source_name text not null default 'manual',
  source_category text not null default 'manual'
    check (source_category in ('email', 'job_board', 'vendor_portal', 'csv', 'manual', 'document')),
  original_url text,
  canonical_url text,
  date_posted date,
  date_received timestamptz not null default now(),
  closing_date date,
  recruiter_name text,
  recruiter_email text,
  recruiter_phone text,
  source_sender text,
  vendor_id uuid references public.vendors(id) on delete set null,
  prime_vendor_id uuid references public.vendors(id) on delete set null,
  implementation_partner_id uuid references public.vendors(id) on delete set null,
  end_client_id uuid references public.vendors(id) on delete set null,
  submission_instructions text,
  email_message_ref text,
  extraction_confidence numeric(4,3) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  field_evidence jsonb not null default '{}'::jsonb,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review')),
  last_verified_at timestamptz,
  last_seen_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'closed', 'expired', 'duplicate', 'needs_review')),
  duplicate_group_id uuid,
  internal_notes text,
  follow_up_status text not null default 'none'
    check (follow_up_status in ('none', 'to_review', 'submitted', 'interviewing', 'on_hold', 'done')),
  fingerprint text,
  search_text text not null default '',
  embedding extensions.vector(1536),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rate_max is null or rate_min is null or rate_max >= rate_min),
  check (years_experience_max is null or years_experience_min is null or years_experience_max >= years_experience_min)
);
create unique index job_requirements_source_job_uniq
  on public.job_requirements (organization_id, source_name, source_job_id) where source_job_id is not null;
create unique index job_requirements_canonical_url_uniq
  on public.job_requirements (organization_id, canonical_url) where canonical_url is not null and status <> 'duplicate';
create index job_requirements_org_received_idx on public.job_requirements (organization_id, date_received desc);
create index job_requirements_org_status_idx on public.job_requirements (organization_id, status);
create index job_requirements_org_state_idx on public.job_requirements (organization_id, location_state);
create index job_requirements_fingerprint_idx on public.job_requirements (organization_id, fingerprint);
create index job_requirements_skills_idx on public.job_requirements using gin (skills);
create index job_requirements_search_trgm on public.job_requirements using gin (search_text extensions.gin_trgm_ops);
create index job_requirements_title_trgm on public.job_requirements using gin (title extensions.gin_trgm_ops);

create table public.requirement_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid not null references public.job_requirements(id) on delete cascade,
  source_record_id uuid references public.source_records(id) on delete set null,
  source_name text not null,
  source_category text not null,
  url text,
  sender text,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requirement_sources_req_idx on public.requirement_sources (requirement_id);

create table public.requirement_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requirement_id uuid not null references public.job_requirements(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null,
  original_text text not null,
  kind text not null default 'required' check (kind in ('required', 'preferred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requirement_id, original_text, kind)
);

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requirement_a uuid not null references public.job_requirements(id) on delete cascade,
  requirement_b uuid not null references public.job_requirements(id) on delete cascade,
  score numeric(4,3) not null check (score between 0 and 1),
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'merged', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requirement_a <> requirement_b),
  unique (requirement_a, requirement_b)
);

-- ---------------------------------------------------------------------------
-- Consultants
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_type text not null check (owner_type in ('source_record', 'requirement', 'consultant')),
  owner_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 26214400),
  sha256 text not null,
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'infected', 'skipped', 'error')),
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attachments_owner_idx on public.attachments (owner_type, owner_id);

create table public.consultants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  primary_skills text[] not null default '{}',
  secondary_skills text[] not null default '{}',
  years_experience numeric(4,1),
  current_location text,
  preferred_locations text[] not null default '{}',
  work_arrangement_pref text check (work_arrangement_pref in ('remote', 'hybrid', 'onsite', 'any')),
  availability_date date,
  target_rate numeric(12,2),
  target_rate_unit text check (target_rate_unit in ('hour', 'year')),
  work_authorization text,
  resume_attachment_id uuid references public.attachments(id) on delete set null,
  internal_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consultant_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete set null,
  original_text text not null,
  level text check (level in ('beginner', 'intermediate', 'advanced', 'expert')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultant_id, original_text)
);

-- ---------------------------------------------------------------------------
-- Saved searches, alerts, extraction jobs, audit
-- ---------------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  query text not null default '',
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  channel text not null default 'in_app' check (channel in ('in_app', 'email')),
  frequency text not null default 'daily' check (frequency in ('instant', 'hourly', 'daily')),
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_record_id uuid not null references public.source_records(id) on delete cascade,
  requirement_id uuid references public.job_requirements(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'rejected')),
  model text,
  prompt_version text,
  output jsonb,
  validation_errors jsonb,
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at, audit, search text
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','users','user_roles','skills','skill_aliases','vendors','vendor_relationships',
    'connected_mailboxes','source_connectors','sync_runs','source_records','job_requirements',
    'requirement_sources','requirement_skills','duplicate_candidates','attachments','consultants',
    'consultant_skills','saved_searches','alerts','extraction_jobs'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_diff jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value))
      into v_diff
      from jsonb_each(v_new - 'search_text' - 'updated_at' - 'embedding') n
     where v_old -> n.key is distinct from n.value;
    if v_diff is null then return new; end if;
  else
    v_diff := (coalesce(v_new, v_old)) - 'search_text' - 'embedding';
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, diff)
  values (
    case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> 'organization_id')::uuid end,
    auth.uid(), lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid, v_diff
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','user_roles','vendors','vendor_relationships','connected_mailboxes','source_connectors',
    'job_requirements','duplicate_candidates','consultants','attachments'
  ] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

create or replace function public.job_requirements_build_search() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_vendors text;
declare v_sources text;
begin
  select string_agg(name, ' ') into v_vendors
    from public.vendors
   where id in (new.vendor_id, new.prime_vendor_id, new.implementation_partner_id, new.end_client_id);
  select string_agg(concat_ws(' ', source_name, sender), ' ') into v_sources
    from public.requirement_sources where requirement_id = new.id;
  new.search_text := lower(concat_ws(' ',
    new.title, new.description, array_to_string(new.skills, ' '), array_to_string(new.preferred_skills, ' '),
    new.location_city, new.location_state, new.work_arrangement, replace(new.employment_type, '_', ' '),
    array_to_string(new.tax_terms, ' '), array_to_string(new.visa_requirements, ' '),
    new.source_job_id, new.source_name, new.source_sender, new.recruiter_name, new.recruiter_email,
    v_vendors, v_sources
  ));
  return new;
end $$;

create trigger build_search before insert or update on public.job_requirements
  for each row execute function public.job_requirements_build_search();

-- Refresh parent search text when sources or vendor names change.
create or replace function public.touch_requirement_from_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.job_requirements set last_seen_at = greatest(last_seen_at, coalesce(new.seen_at, last_seen_at))
   where id = coalesce(new.requirement_id, old.requirement_id);
  return coalesce(new, old);
end $$;
create trigger touch_requirement after insert or update or delete on public.requirement_sources
  for each row execute function public.touch_requirement_from_source();

create or replace function public.touch_requirements_from_vendor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.job_requirements set updated_at = now()
     where new.id in (vendor_id, prime_vendor_id, implementation_partner_id, end_client_id);
  end if;
  return new;
end $$;
create trigger touch_requirements after update of name on public.vendors
  for each row execute function public.touch_requirements_from_vendor();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.skills enable row level security;
alter table public.skill_aliases enable row level security;
alter table public.audit_logs enable row level security;
alter table public.consultants enable row level security;
alter table public.consultant_skills enable row level security;
alter table public.saved_searches enable row level security;
alter table public.alerts enable row level security;
alter table public.connected_mailboxes enable row level security;

create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin'])) with check (public.has_org_role(id, array['owner', 'admin']));
create policy org_delete on public.organizations for delete to authenticated using (public.has_org_role(id, array['owner']));

create policy users_select on public.users for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.user_roles mine join public.user_roles theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = users.id
  )
);
create policy users_update on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy roles_select on public.user_roles for select to authenticated using (public.is_org_member(organization_id));
create policy roles_insert on public.user_roles for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']) and role <> 'owner');
create policy roles_update on public.user_roles for update to authenticated
  using (public.has_org_role(organization_id, array['owner']))
  with check (public.has_org_role(organization_id, array['owner']));
create policy roles_delete on public.user_roles for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']) and user_id <> auth.uid());

create policy skills_select on public.skills for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy skills_write on public.skills for all to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']))
  with check (organization_id is not null and public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));
create policy aliases_select on public.skill_aliases for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy aliases_write on public.skill_aliases for all to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']))
  with check (organization_id is not null and public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));

create policy audit_select on public.audit_logs for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

-- Consultant data is sensitive: viewers cannot read it.
create policy consultants_select on public.consultants for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));
create policy consultants_write on public.consultants for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));
create policy consultant_skills_select on public.consultant_skills for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));
create policy consultant_skills_write on public.consultant_skills for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));

create policy saved_searches_own on public.saved_searches for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));
create policy alerts_own on public.alerts for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- Mailboxes: org members see status; only the owner of a mailbox (or admins) can change it.
create policy mailboxes_select on public.connected_mailboxes for select to authenticated
  using (public.is_org_member(organization_id));
create policy mailboxes_insert on public.connected_mailboxes for insert to authenticated
  with check (owner_user_id = auth.uid() and public.has_org_role(organization_id, array['owner', 'admin', 'recruiter']));
create policy mailboxes_update on public.connected_mailboxes for update to authenticated
  using (owner_user_id = auth.uid() or public.has_org_role(organization_id, array['owner', 'admin']))
  with check (owner_user_id = auth.uid() or public.has_org_role(organization_id, array['owner', 'admin']));
create policy mailboxes_delete on public.connected_mailboxes for delete to authenticated
  using (owner_user_id = auth.uid() or public.has_org_role(organization_id, array['owner', 'admin']));

-- Standard org-scoped tables: members read, recruiters+ write, admins+ delete.
do $$
declare t text;
begin
  foreach t in array array[
    'vendors','vendor_relationships','source_connectors','sync_runs','source_records','job_requirements',
    'requirement_sources','requirement_skills','duplicate_candidates','attachments','extraction_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy member_select on public.%I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format($p$create policy writer_insert on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array['owner','admin','recruiter']))$p$, t);
    execute format($p$create policy writer_update on public.%I for update to authenticated using (public.has_org_role(organization_id, array['owner','admin','recruiter'])) with check (public.has_org_role(organization_id, array['owner','admin','recruiter']))$p$, t);
    execute format($p$create policy admin_delete on public.%I for delete to authenticated using (public.has_org_role(organization_id, array['owner','admin']))$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_slug text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if length(trim(p_name)) < 2 then raise exception 'organization name too short' using errcode = '22023'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := left(coalesce(nullif(v_slug, ''), 'org'), 48) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  insert into public.organizations (name, slug) values (trim(p_name), v_slug) returning id into v_org;
  insert into public.user_roles (user_id, organization_id, role) values (v_uid, v_org, 'owner');
  perform public.provision_default_connectors(v_org);
  return v_org;
end $$;

create or replace function public.provision_default_connectors(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.source_connectors (organization_id, connector_key, display_name, auth_status, config)
  values
    (p_org, 'linkedin', 'LinkedIn Jobs', 'no_authorized_access', '{"mode": "link_out_and_alert_emails"}'),
    (p_org, 'indeed', 'Indeed', 'no_authorized_access', '{"mode": "link_out_and_alert_emails"}'),
    (p_org, 'dice', 'Dice', 'no_authorized_access', '{"mode": "link_out_and_alert_emails"}'),
    (p_org, 'careerbuilder', 'CareerBuilder', 'no_authorized_access', '{"mode": "verify_access"}'),
    (p_org, 'monster', 'Monster', 'no_authorized_access', '{"mode": "verify_access"}'),
    (p_org, 'usajobs', 'USAJOBS', 'not_configured', '{"mode": "official_api"}'),
    (p_org, 'adzuna', 'Adzuna', 'not_configured', '{"mode": "official_api"}'),
    (p_org, 'greenhouse', 'Greenhouse job boards', 'not_configured', '{"mode": "public_board_api"}'),
    (p_org, 'lever', 'Lever job boards', 'not_configured', '{"mode": "public_board_api"}')
  on conflict (organization_id, connector_key) do nothing;
$$;
revoke execute on function public.provision_default_connectors(uuid) from public, anon, authenticated;
