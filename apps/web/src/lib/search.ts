import 'server-only';
import {
  expandSynonyms, parseQuery, positiveTerms, QueryParseError, SynonymIndex, toDbFilters, type SearchParams,
} from '@benchflow/core';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SearchRow {
  id: string; title: string; skills: string[]; location_city: string | null; location_state: string | null;
  work_arrangement: string | null; employment_type: string | null; rate_min: number | null; rate_max: number | null;
  rate_unit: string | null; currency: string | null; tax_terms: string[]; visa_requirements: string[];
  source_name: string; source_category: string; date_received: string; status: string; source_job_id: string | null;
  original_url: string | null; vendor_name: string | null; end_client_name: string | null;
}

export const PAGE_SIZE = 25;

export async function loadSynonyms(supabase: SupabaseClient): Promise<SynonymIndex> {
  const { data } = await supabase.from('skills').select('name, skill_aliases(alias)').limit(5000);
  return new SynonymIndex(
    (data ?? []).map((s: { name: string; skill_aliases: { alias: string }[] }) => ({ name: s.name, aliases: s.skill_aliases.map((a) => a.alias) })),
  );
}

export async function searchRequirements(supabase: SupabaseClient, orgId: string, params: SearchParams) {
  let query = null;
  let parseError: string | null = null;
  try {
    query = parseQuery(params.q);
  } catch (e) {
    if (e instanceof QueryParseError) parseError = e.message;
    else throw e;
  }
  const expanded = query ? expandSynonyms(query, await loadSynonyms(supabase)) : null;
  const sort = params.sort === 'newest' && params.q && query ? 'newest' : params.sort;
  const { data, error } = await supabase.rpc('search_requirements', {
    p_org: orgId,
    p_query: expanded,
    p_filters: toDbFilters(params),
    p_text: positiveTerms(query).join(' '),
    p_sort: sort,
    p_limit: PAGE_SIZE,
    p_offset: (params.page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  const result = data as { total: number; rows: SearchRow[] };
  return { ...result, parseError, expanded };
}
