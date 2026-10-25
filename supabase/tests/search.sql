-- Search behaviour tests against the synthetic seed (expanded ASTs mirror what packages/core sends).
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'SEARCH TEST FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
create or replace function pg_temp.s(p_query jsonb, p_filters jsonb default '{}') returns jsonb language sql as $$
  select public.search_requirements('00000000-0000-4000-8000-000000000001', p_query, p_filters, '', 'newest', 100, 0);
$$;
create or replace function pg_temp.t(p_values text[], p_field text default null) returns jsonb language sql as $$
  select jsonb_build_object('type', 'term', 'field', p_field, 'values', to_jsonb(p_values), 'prefix', false);
$$;

-- A requirement mentioning Texas only in the description (no state code), and one using the word "in".
reset role;
insert into public.job_requirements (organization_id, title, description, skills)
values ('00000000-0000-4000-8000-000000000001', 'Remote Data Analyst', 'Candidates must live in Texas.', '{SQL}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- State code expansion: TX + Texas finds both coded and spelled-out locations.
select pg_temp.check((pg_temp.s(pg_temp.t('{TX}')) ->> 'total')::int >= 5, 'literal TX matches the TX-coded seed jobs');
select pg_temp.check(
  (select bool_and(r ->> 'location_state' = 'TX') from jsonb_array_elements(pg_temp.s(pg_temp.t('{TX}')) -> 'rows') r),
  'literal TX only returns TX-located jobs');
select pg_temp.check((pg_temp.s(pg_temp.t('{TX,Texas}')) ->> 'total')::int = (pg_temp.s(pg_temp.t('{TX}')) ->> 'total')::int + 1,
  'expanded TX also matches the job that only says Texas in its description');
select pg_temp.check((pg_temp.s(pg_temp.t('{IN,Indiana}', 'location')) ->> 'total')::int = 0, 'state:IN matches location only, not the word "in"');
select pg_temp.check((pg_temp.s(pg_temp.t('{in}')) ->> 'total')::int > 0, 'free-text "in" still matches as an ordinary word');

-- Ordinary two-letter keywords.
select pg_temp.check(
  (select bool_and(r ->> 'title' ilike '%QA%') from jsonb_array_elements(pg_temp.s(pg_temp.t('{QA}')) -> 'rows') r)
  and (pg_temp.s(pg_temp.t('{QA}')) ->> 'total')::int = 1, 'QA matches only the QA job');

-- Empty results.
select pg_temp.check(pg_temp.s(pg_temp.t('{zzzznotaskill}')) = '{"total": 0, "rows": []}'::jsonb, 'no matches returns total 0 and empty rows');
select pg_temp.check((pg_temp.s(pg_temp.t('{TX,Texas}'), '{"states":["NJ"]}') ->> 'total')::int = 0, 'conflicting query and state filter returns nothing');

-- Combined query + filters.
select pg_temp.check((pg_temp.s(
  jsonb_build_object('type', 'and', 'children', jsonb_build_array(pg_temp.t('{Java}'), pg_temp.t('{TX,Texas}'))),
  '{"tax_terms":["C2C"],"work_arrangements":["onsite"]}') ->> 'total')::int = 2, 'Java AND TX + C2C + onsite');
select pg_temp.check((pg_temp.s(pg_temp.t('{Snowflake}'), '{"states":["TX"],"source_categories":["email"]}') ->> 'total')::int = 1, 'Snowflake + state TX + email source');
select pg_temp.check((pg_temp.s(null, '{"states":["NJ"],"employment_types":["full_time"]}') ->> 'total')::int = 1, 'filters without a query');

rollback;
