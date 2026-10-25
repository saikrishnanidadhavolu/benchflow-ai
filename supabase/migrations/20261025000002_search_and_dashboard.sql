-- Search (Boolean AST -> safe SQL) and dashboard aggregates. Both run as the caller so RLS applies.

create or replace function public.search_term_pattern(p_value text, p_prefix boolean) returns text
language sql immutable as $$
  select
    case when lower(p_value) ~ '^[a-z0-9]' then '(^|[^a-z0-9])' else '' end
    || regexp_replace(lower(p_value), '([.*+?^${}()|\[\]\\/-])', '\\\1', 'g')
    || case when p_prefix or lower(p_value) !~ '[a-z0-9]$' then '' else '($|[^a-z0-9])' end;
$$;

create or replace function public.search_build_condition(p_node jsonb) returns text
language plpgsql immutable as $$
declare
  v_type text := p_node ->> 'type';
  v_parts text[] := '{}';
  v_child jsonb;
  v_value text;
  v_pattern text;
  v_field text;
  v_prefix boolean;
  v_target text;
begin
  if v_type in ('and', 'or') then
    for v_child in select * from jsonb_array_elements(coalesce(p_node -> 'children', '[]'::jsonb)) loop
      v_parts := v_parts || public.search_build_condition(v_child);
    end loop;
    if cardinality(v_parts) = 0 then return 'true'; end if;
    return '(' || array_to_string(v_parts, case when v_type = 'and' then ' and ' else ' or ' end) || ')';
  elsif v_type = 'not' then
    return '(not coalesce(' || public.search_build_condition(p_node -> 'child') || ', false))';
  elsif v_type = 'term' then
    v_field := coalesce(p_node ->> 'field', 'any');
    v_prefix := coalesce((p_node ->> 'prefix')::boolean, false);
    for v_value in select jsonb_array_elements_text(coalesce(p_node -> 'values', '[]'::jsonb)) loop
      continue when length(trim(v_value)) = 0;
      if v_field = 'status' then
        v_parts := v_parts || format('r.status = %L', lower(v_value));
        continue;
      end if;
      v_pattern := quote_literal(public.search_term_pattern(trim(v_value), v_prefix));
      v_target := case v_field
        when 'title' then 'lower(r.title)'
        when 'skill' then 'lower(array_to_string(r.skills || r.preferred_skills, '' ''))'
        when 'location' then 'lower(concat_ws('' '', r.location_city, r.location_state))'
        when 'jobid' then 'lower(coalesce(r.source_job_id, ''''))'
        when 'sender' then 'lower(concat_ws('' '', r.source_sender, r.recruiter_email))'
        when 'recruiter' then 'lower(concat_ws('' '', r.recruiter_name, r.recruiter_email))'
        when 'type' then 'lower(concat_ws('' '', replace(r.employment_type, ''_'', '' ''), r.work_arrangement, array_to_string(r.tax_terms, '' '')))'
        else null
      end;
      if v_target is not null then
        v_parts := v_parts || format('%s ~ %s', v_target, v_pattern);
      elsif v_field = 'source' then
        v_parts := v_parts || format(
          '(lower(concat_ws('' '', r.source_name, r.source_category)) ~ %1$s or exists (select 1 from public.requirement_sources rs where rs.requirement_id = r.id and lower(concat_ws('' '', rs.source_name, rs.sender)) ~ %1$s))',
          v_pattern);
      elsif v_field in ('vendor', 'prime', 'partner', 'client', 'company') then
        v_parts := v_parts || format(
          '(exists (select 1 from public.vendors v where lower(v.name) ~ %s and v.id in (%s)))',
          v_pattern,
          case v_field
            when 'vendor' then 'r.vendor_id'
            when 'prime' then 'r.prime_vendor_id'
            when 'partner' then 'r.implementation_partner_id'
            when 'client' then 'r.end_client_id'
            else 'r.vendor_id, r.prime_vendor_id, r.implementation_partner_id, r.end_client_id'
          end);
      else
        v_parts := v_parts || format('r.search_text ~ %s', v_pattern);
      end if;
    end loop;
    if cardinality(v_parts) = 0 then return 'true'; end if;
    return '(' || array_to_string(v_parts, ' or ') || ')';
  end if;
  return 'true';
end $$;

create or replace function public.search_requirements(
  p_org uuid,
  p_query jsonb default null,
  p_filters jsonb default '{}'::jsonb,
  p_text text default null,
  p_sort text default 'newest',
  p_limit int default 25,
  p_offset int default 0
) returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare
  v_where text := 'r.organization_id = $1';
  v_order text;
  v_result jsonb;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if not public.is_org_member(p_org) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if p_query is not null and p_query <> 'null'::jsonb then
    v_where := v_where || ' and ' || public.search_build_condition(p_query);
  end if;

  if jsonb_array_length(coalesce(f -> 'statuses', '[]')) > 0 then
    v_where := v_where || ' and r.status in (select jsonb_array_elements_text($2 -> ''statuses''))';
  elsif not (p_query::text ~ '"field": "status"') or p_query is null then
    v_where := v_where || ' and r.status <> ''duplicate''';
  end if;
  if jsonb_array_length(coalesce(f -> 'source_categories', '[]')) > 0 then
    v_where := v_where || ' and r.source_category in (select jsonb_array_elements_text($2 -> ''source_categories''))';
  end if;
  if jsonb_array_length(coalesce(f -> 'source_names', '[]')) > 0 then
    v_where := v_where || ' and (r.source_name in (select jsonb_array_elements_text($2 -> ''source_names'')) or exists (select 1 from public.requirement_sources rs where rs.requirement_id = r.id and rs.source_name in (select jsonb_array_elements_text($2 -> ''source_names''))))';
  end if;
  if jsonb_array_length(coalesce(f -> 'states', '[]')) > 0 then
    v_where := v_where || ' and r.location_state in (select jsonb_array_elements_text($2 -> ''states''))';
  end if;
  if jsonb_array_length(coalesce(f -> 'work_arrangements', '[]')) > 0 then
    v_where := v_where || ' and r.work_arrangement in (select jsonb_array_elements_text($2 -> ''work_arrangements''))';
  end if;
  if jsonb_array_length(coalesce(f -> 'employment_types', '[]')) > 0 then
    v_where := v_where || ' and r.employment_type in (select jsonb_array_elements_text($2 -> ''employment_types''))';
  end if;
  if jsonb_array_length(coalesce(f -> 'tax_terms', '[]')) > 0 then
    v_where := v_where || ' and r.tax_terms && array(select jsonb_array_elements_text($2 -> ''tax_terms''))';
  end if;
  if jsonb_array_length(coalesce(f -> 'skills', '[]')) > 0 then
    v_where := v_where || ' and (select bool_and(exists (select 1 from unnest(r.skills || r.preferred_skills) s where lower(s) = lower(want))) from jsonb_array_elements_text($2 -> ''skills'') want)';
  end if;
  if f ? 'vendor_id' and nullif(f ->> 'vendor_id', '') is not null then
    v_where := v_where || ' and ($2 ->> ''vendor_id'')::uuid in (r.vendor_id, r.prime_vendor_id, r.implementation_partner_id, r.end_client_id)';
  end if;
  if nullif(f ->> 'date_from', '') is not null then
    v_where := v_where || ' and r.date_received >= ($2 ->> ''date_from'')::timestamptz';
  end if;
  if nullif(f ->> 'date_to', '') is not null then
    v_where := v_where || ' and r.date_received < ($2 ->> ''date_to'')::timestamptz';
  end if;
  if nullif(f ->> 'received_within_hours', '') is not null then
    v_where := v_where || ' and r.date_received >= now() - make_interval(hours => ($2 ->> ''received_within_hours'')::int)';
  end if;

  v_order := case p_sort
    when 'oldest' then 'r.date_received asc, r.id'
    when 'title' then 'lower(r.title) asc, r.id'
    when 'relevance' then 'word_similarity(lower($3), lower(r.title)) desc, r.date_received desc, r.id'
    else 'r.date_received desc, r.id'
  end;

  execute format($q$
    with matched as (
      select r.* from public.job_requirements r where %s
    ), page as (
      select m.* from matched m order by %s limit $4 offset $5
    )
    select jsonb_build_object(
      'total', (select count(*) from matched),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'skills', p.skills, 'location_city', p.location_city,
          'location_state', p.location_state, 'work_arrangement', p.work_arrangement,
          'employment_type', p.employment_type, 'rate_min', p.rate_min, 'rate_max', p.rate_max,
          'rate_unit', p.rate_unit, 'currency', p.currency, 'tax_terms', p.tax_terms,
          'visa_requirements', p.visa_requirements, 'source_name', p.source_name,
          'source_category', p.source_category, 'date_received', p.date_received, 'status', p.status,
          'source_job_id', p.source_job_id, 'original_url', p.original_url,
          'vendor_name', (select name from public.vendors v where v.id = p.vendor_id),
          'end_client_name', (select name from public.vendors v where v.id = p.end_client_id)
        ) order by rn)
        from (select page.*, row_number() over () as rn from page) p
      ), '[]'::jsonb)
    )
  $q$, v_where, replace(v_order, 'r.', 'm.'))
  into v_result
  using p_org, f, coalesce(p_text, ''), p_limit, p_offset;
  return v_result;
end $$;

create or replace function public.dashboard_stats(p_org uuid, p_tz text default 'UTC') returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_today timestamptz;
  v_result jsonb;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then p_tz := 'UTC'; end if;
  v_today := (date_trunc('day', now() at time zone p_tz)) at time zone p_tz;

  with r as (select * from public.job_requirements where organization_id = p_org)
  select jsonb_build_object(
    'total', (select count(*) from r),
    'new_today', (select count(*) from r where date_received >= v_today),
    'from_email', (select count(*) from r where source_category = 'email'),
    'from_job_boards', (select count(*) from r where source_category = 'job_board'),
    'unique_after_dedupe', (select count(distinct coalesce(duplicate_group_id, id)) from r where status <> 'duplicate'),
    'active', (select count(*) from r where status = 'active'),
    'needs_review', (select count(*) from r where status = 'needs_review'),
    'by_technology', coalesce((select jsonb_agg(jsonb_build_object('label', s, 'count', c) order by c desc, s)
        from (select s, count(*) c from r, unnest(r.skills) s where r.status <> 'duplicate' group by s order by c desc, s limit 12) t), '[]'),
    'by_state', coalesce((select jsonb_agg(jsonb_build_object('label', location_state, 'count', c) order by c desc, location_state)
        from (select location_state, count(*) c from r where location_state is not null and status <> 'duplicate' group by 1 order by c desc, 1 limit 12) t), '[]'),
    'by_visa', coalesce((select jsonb_agg(jsonb_build_object('label', v, 'count', c) order by c desc, v)
        from (select v, count(*) c from r, unnest(r.visa_requirements) v where r.status <> 'duplicate' group by v order by c desc, v limit 12) t), '[]'),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('label', source_name, 'category', source_category, 'count', c) order by c desc, source_name)
        from (select source_name, source_category, count(*) c from r group by 1, 2 order by c desc, 1 limit 12) t), '[]'),
    'by_date', coalesce((select jsonb_agg(jsonb_build_object('date', d::date, 'count', coalesce(c, 0)) order by d)
        from generate_series(((v_today at time zone p_tz)::date - 13)::timestamp, (v_today at time zone p_tz)::date::timestamp, interval '1 day') d
        left join (select (date_received at time zone p_tz)::date as received_day, count(*) c from r group by 1) x on x.received_day = d::date), '[]'),
    'recently_expired', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'closing_date', closing_date, 'updated_at', updated_at) order by updated_at desc)
        from (select * from r where status in ('expired', 'closed') or (closing_date is not null and closing_date < (v_today at time zone p_tz)::date and status = 'active')
              order by updated_at desc limit 8) t), '[]')
  ) into v_result;
  return v_result;
end $$;

grant execute on function public.search_requirements(uuid, jsonb, jsonb, text, text, int, int) to authenticated;
grant execute on function public.dashboard_stats(uuid, text) to authenticated;
grant execute on function public.create_organization(text) to authenticated;
revoke execute on function public.search_requirements(uuid, jsonb, jsonb, text, text, int, int) from anon;
revoke execute on function public.dashboard_stats(uuid, text) from anon;
revoke execute on function public.create_organization(text) from anon;
