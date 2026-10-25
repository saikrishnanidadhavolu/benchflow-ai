import 'server-only';
import {
  canonicalizeUrl, contentHash, findDuplicates, requirementFingerprint, type DedupeCandidate, type DedupeMatch, type RequirementInput,
} from '@benchflow/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppContext } from '@/lib/auth';

type VendorCategory = 'staffing' | 'prime_vendor' | 'implementation_partner' | 'end_client';

/** Finds a vendor by case-insensitive name, creating an unverified record if needed. */
export async function resolveVendorId(
  supabase: SupabaseClient,
  ctx: AppContext,
  name: string | null,
  category: VendorCategory,
  cache?: Map<string, string>,
): Promise<string | null> {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const cached = cache?.get(key);
  if (cached) return cached;
  const { data: existing } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', ctx.orgId)
    .ilike('name', name.trim().replace(/[%_\\]/g, (c) => `\\${c}`))
    .limit(1)
    .maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await supabase
      .from('vendors')
      .insert({ organization_id: ctx.orgId, name: name.trim(), category, verification_status: 'unverified', info_source: 'Entered with a requirement', created_by: ctx.userId })
      .select('id')
      .single();
    if (error) throw new Error(`Could not save vendor "${name}": ${error.message}`);
    id = data.id as string;
  }
  cache?.set(key, id);
  return id;
}

export type SkillMap = Map<string, string>;

/** Maps lowercase skill names and aliases to skill ids (global + organization). */
export async function loadSkillMap(supabase: SupabaseClient): Promise<SkillMap> {
  const { data } = await supabase.from('skills').select('id, name, skill_aliases(alias)').limit(5000);
  const map: SkillMap = new Map();
  for (const s of (data ?? []) as { id: string; name: string; skill_aliases: { alias: string }[] }[]) {
    map.set(s.name.toLowerCase(), s.id);
    for (const a of s.skill_aliases) map.set(a.alias.toLowerCase(), s.id);
  }
  return map;
}

async function findCandidates(supabase: SupabaseClient, orgId: string, keys: { source_name: string; source_job_id: string | null; canonical_url: string | null; fingerprint: string }) {
  const cols = 'id, title, description, source_name, source_job_id, canonical_url, fingerprint';
  const base = () => supabase.from('job_requirements').select(cols).eq('organization_id', orgId).neq('status', 'duplicate').limit(20);
  const queries = [base().eq('fingerprint', keys.fingerprint)];
  if (keys.source_job_id) queries.push(base().eq('source_name', keys.source_name).eq('source_job_id', keys.source_job_id));
  if (keys.canonical_url) queries.push(base().eq('canonical_url', keys.canonical_url));
  const results = await Promise.all(queries);
  const byId = new Map<string, DedupeCandidate>();
  for (const r of results) for (const row of (r.data ?? []) as DedupeCandidate[]) byId.set(row.id, row);
  return [...byId.values()];
}

export interface CreateResult {
  outcome: 'created' | 'existing';
  id: string;
  possibleDuplicates: DedupeMatch[];
}

export interface CreateOptions {
  syncRunId?: string | null;
  rawPayload?: Record<string, unknown>;
  vendorCache?: Map<string, string>;
  skillMap?: SkillMap;
}

/**
 * Saves a validated requirement with its raw source record. Exact matches (same source job ID or canonical URL)
 * attach a new source reference to the existing requirement; fuzzy matches are saved and queued for human review.
 */
export async function createRequirement(supabase: SupabaseClient, ctx: AppContext, input: RequirementInput, opts: CreateOptions = {}): Promise<CreateResult> {
  const canonical_url = canonicalizeUrl(input.original_url);
  const fingerprint = requirementFingerprint({
    title: input.title,
    company: input.end_client_name ?? input.vendor_name,
    city: input.location_city,
    state: input.location_state,
  });

  const { data: sourceRecord, error: srError } = await supabase
    .from('source_records')
    .insert({
      organization_id: ctx.orgId,
      source_type: input.source_category === 'csv' ? 'csv' : 'manual',
      source_name: input.source_name,
      sync_run_id: opts.syncRunId ?? null,
      canonical_url,
      raw_text: input.description,
      raw_payload: opts.rawPayload ?? input,
      content_hash: contentHash(`${input.title}\n${input.description ?? ''}`),
      classification: 'job_requirement',
      processing_status: 'processed',
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (srError) throw new Error(`Could not save source record: ${srError.message}`);

  const candidates = await findCandidates(supabase, ctx.orgId, { source_name: input.source_name, source_job_id: input.source_job_id, canonical_url, fingerprint });
  const matches = findDuplicates({ title: input.title, description: input.description, source_name: input.source_name, source_job_id: input.source_job_id, canonical_url, fingerprint }, candidates);
  const exact = matches.find((m) => m.exact);

  if (exact) {
    const { error } = await supabase.from('requirement_sources').insert({
      organization_id: ctx.orgId,
      requirement_id: exact.id,
      source_record_id: sourceRecord.id,
      source_name: input.source_name,
      source_category: input.source_category,
      url: input.original_url,
      sender: input.recruiter_email,
    });
    if (error) throw new Error(`Could not link source: ${error.message}`);
    return { outcome: 'existing', id: exact.id, possibleDuplicates: [] };
  }

  const [vendor_id, prime_vendor_id, implementation_partner_id, end_client_id] = await Promise.all([
    resolveVendorId(supabase, ctx, input.vendor_name, 'staffing', opts.vendorCache),
    resolveVendorId(supabase, ctx, input.prime_vendor_name, 'prime_vendor', opts.vendorCache),
    resolveVendorId(supabase, ctx, input.implementation_partner_name, 'implementation_partner', opts.vendorCache),
    resolveVendorId(supabase, ctx, input.end_client_name, 'end_client', opts.vendorCache),
  ]);

  const { vendor_name: _v, prime_vendor_name: _p, implementation_partner_name: _i, end_client_name: _e, ...fields } = input;
  const { data: created, error } = await supabase
    .from('job_requirements')
    .insert({
      ...fields,
      organization_id: ctx.orgId,
      vendor_id,
      prime_vendor_id,
      implementation_partner_id,
      end_client_id,
      canonical_url,
      fingerprint,
      email_message_ref: null,
      verification_status: 'unverified',
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('A requirement with the same source job ID or URL already exists.');
    throw new Error(`Could not save requirement: ${error.message}`);
  }

  const skillMap = opts.skillMap ?? (await loadSkillMap(supabase));
  const skillRows = [
    ...input.skills.map((s) => ({ original_text: s, kind: 'required' as const })),
    ...input.preferred_skills.map((s) => ({ original_text: s, kind: 'preferred' as const })),
  ].map((s) => ({ ...s, organization_id: ctx.orgId, requirement_id: created.id, skill_id: skillMap.get(s.original_text.toLowerCase()) ?? null }));

  const writes = [
    supabase.from('requirement_sources').insert({
      organization_id: ctx.orgId,
      requirement_id: created.id,
      source_record_id: sourceRecord.id,
      source_name: input.source_name,
      source_category: input.source_category,
      url: input.original_url,
      sender: input.recruiter_email,
    }),
    skillRows.length ? supabase.from('requirement_skills').insert(skillRows) : null,
    matches.length
      ? supabase.from('duplicate_candidates').insert(
          matches.map((m) => ({ organization_id: ctx.orgId, requirement_a: m.id, requirement_b: created.id, score: m.score, reasons: m.reasons })),
        )
      : null,
  ].filter(Boolean);
  const results = await Promise.all(writes);
  const failed = results.find((r) => r && r.error);
  if (failed?.error) throw new Error(`Saved requirement but could not save related records: ${failed.error.message}`);

  return { outcome: 'created', id: created.id, possibleDuplicates: matches };
}
