'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CSV_TARGET_FIELDS, parseCsv, REQUIREMENT_STATUSES, requirementInputSchema, suggestMapping, validateRows, type CsvMapping,
} from '@benchflow/core';
import { requireRole, ADMIN_ROLES, WRITE_ROLES, AuthorizationError } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createRequirement, loadSkillMap, resolveVendorId } from '@/lib/requirements';
import { rateLimit } from '@/lib/rate-limit';

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function formToObject(formData: FormData) {
  const obj: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string' && !k.startsWith('$')) obj[k] = v;
  return obj;
}

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const key = String(i.path[0] ?? 'form');
    out[key] ??= i.message;
  }
  return out;
}

function errorMessage(e: unknown) {
  if (e instanceof AuthorizationError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export async function createRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let id: string;
  try {
    const ctx = await requireRole(WRITE_ROLES);
    const parsed = requirementInputSchema.safeParse({ ...formToObject(formData), source_category: 'manual', source_name: 'Manual entry' });
    if (!parsed.success) return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) };
    const supabase = await createClient();
    const result = await createRequirement(supabase, ctx, parsed.data);
    id = result.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath('/requirements');
  revalidatePath('/dashboard');
  redirect(`/requirements/${id}`);
}

export async function updateRequirementAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireRole(WRITE_ROLES);
    z.string().uuid().parse(id);
    const supabase = await createClient();
    const { data: existing } = await supabase.from('job_requirements').select('source_name, source_category').eq('id', id).eq('organization_id', ctx.orgId).maybeSingle();
    if (!existing) return { error: 'Requirement not found.' };
    const parsed = requirementInputSchema.safeParse({ ...formToObject(formData), source_name: existing.source_name, source_category: existing.source_category });
    if (!parsed.success) return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(parsed.error) };
    const input = parsed.data;
    const cache = new Map<string, string>();
    const [vendor_id, prime_vendor_id, implementation_partner_id, end_client_id] = await Promise.all([
      resolveVendorId(supabase, ctx, input.vendor_name, 'staffing', cache),
      resolveVendorId(supabase, ctx, input.prime_vendor_name, 'prime_vendor', cache),
      resolveVendorId(supabase, ctx, input.implementation_partner_name, 'implementation_partner', cache),
      resolveVendorId(supabase, ctx, input.end_client_name, 'end_client', cache),
    ]);
    const { vendor_name: _v, prime_vendor_name: _p, implementation_partner_name: _i, end_client_name: _e, source_name: _s, source_category: _c, ...fields } = input;
    const { error } = await supabase
      .from('job_requirements')
      .update({ ...fields, vendor_id, prime_vendor_id, implementation_partner_id, end_client_id })
      .eq('id', id)
      .eq('organization_id', ctx.orgId);
    if (error) return { error: error.code === '23505' ? 'Another requirement already uses this source job ID or URL.' : error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/requirements/${id}`);
  redirect(`/requirements/${id}`);
}

export async function setStatusAction(formData: FormData) {
  const ctx = await requireRole(WRITE_ROLES);
  const id = z.string().uuid().parse(formData.get('id'));
  const status = z.enum(REQUIREMENT_STATUSES).parse(formData.get('status'));
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'active') {
    patch.last_verified_at = new Date().toISOString();
    patch.verification_status = 'verified';
  }
  const { error } = await supabase.from('job_requirements').update(patch).eq('id', id).eq('organization_id', ctx.orgId);
  if (error) throw new Error(error.message);
  revalidatePath(`/requirements/${id}`);
  revalidatePath('/dashboard');
}

export async function saveNotesAction(formData: FormData) {
  const ctx = await requireRole(WRITE_ROLES);
  const id = z.string().uuid().parse(formData.get('id'));
  const notes = z.string().max(10000).parse(formData.get('internal_notes') ?? '');
  const follow = z.enum(['none', 'to_review', 'submitted', 'interviewing', 'on_hold', 'done']).parse(formData.get('follow_up_status'));
  const supabase = await createClient();
  const { error } = await supabase
    .from('job_requirements')
    .update({ internal_notes: notes.trim() || null, follow_up_status: follow })
    .eq('id', id)
    .eq('organization_id', ctx.orgId);
  if (error) throw new Error(error.message);
  revalidatePath(`/requirements/${id}`);
}

export async function resolveDuplicateAction(formData: FormData) {
  const ctx = await requireRole(WRITE_ROLES);
  const candidateId = z.string().uuid().parse(formData.get('candidate_id'));
  const decision = z.enum(['merged', 'rejected']).parse(formData.get('decision'));
  const returnTo = z.string().uuid().parse(formData.get('return_to'));
  const supabase = await createClient();
  const { data: c } = await supabase
    .from('duplicate_candidates')
    .select('id, requirement_a, requirement_b, status')
    .eq('id', candidateId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!c || c.status !== 'pending') throw new Error('This duplicate suggestion was already reviewed.');

  if (decision === 'merged') {
    // requirement_a is the existing (primary) record; requirement_b becomes a duplicate of it.
    const { data: primary } = await supabase.from('job_requirements').select('id, duplicate_group_id').eq('id', c.requirement_a).single();
    const group = primary?.duplicate_group_id ?? c.requirement_a;
    const { data: sources } = await supabase.from('requirement_sources').select('source_record_id, source_name, source_category, url, sender, seen_at').eq('requirement_id', c.requirement_b);
    const ops = [
      supabase.from('job_requirements').update({ duplicate_group_id: group }).eq('id', c.requirement_a),
      supabase.from('job_requirements').update({ status: 'duplicate', duplicate_group_id: group }).eq('id', c.requirement_b),
    ];
    if (sources?.length) {
      ops.push(
        supabase.from('requirement_sources').insert(sources.map((s) => ({ ...s, organization_id: ctx.orgId, requirement_id: c.requirement_a }))) as never,
      );
    }
    const results = await Promise.all(ops);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }
  const { error } = await supabase
    .from('duplicate_candidates')
    .update({ status: decision, reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() })
    .eq('id', candidateId);
  if (error) throw new Error(error.message);
  revalidatePath(`/requirements/${returnTo}`);
  revalidatePath('/dashboard');
}

export async function deleteRequirementAction(formData: FormData) {
  const ctx = await requireRole(ADMIN_ROLES);
  const id = z.string().uuid().parse(formData.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.from('job_requirements').delete().eq('id', id).eq('organization_id', ctx.orgId);
  if (error) throw new Error(error.message);
  revalidatePath('/requirements');
  revalidatePath('/dashboard');
  redirect('/requirements');
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const mappingSchema = z
  .record(z.string(), z.string().max(200))
  .transform((m) => Object.fromEntries(Object.entries(m).filter(([k]) => (CSV_TARGET_FIELDS as readonly string[]).includes(k))) as CsvMapping);

export interface CsvPreview {
  error?: string;
  headers?: string[];
  mapping?: CsvMapping;
  totalRows?: number;
  validRows?: number;
  parseErrors?: string[];
  sample?: { rowNumber: number; ok: boolean; errors: string[]; title?: string; location?: string; skills?: string[] }[];
}

export async function previewCsvAction(text: string, mapping: CsvMapping | null, fileName: string): Promise<CsvPreview> {
  try {
    await requireRole(WRITE_ROLES);
    const parsed = parseCsv(z.string().parse(text));
    if (!parsed.headers.length) return { error: parsed.errors[0] ?? 'The file has no header row.' };
    const m = mapping ? mappingSchema.parse(mapping) : suggestMapping(parsed.headers);
    const validated = validateRows(parsed.rows, m, { source_name: `CSV: ${fileName.slice(0, 80)}` });
    return {
      headers: parsed.headers,
      mapping: m,
      totalRows: validated.length,
      validRows: validated.filter((r) => r.ok).length,
      parseErrors: parsed.errors,
      sample: validated.slice(0, 50).map((r) => ({
        rowNumber: r.rowNumber,
        ok: r.ok,
        errors: r.errors,
        title: r.data?.title,
        location: [r.data?.location_city, r.data?.location_state].filter(Boolean).join(', '),
        skills: r.data?.skills,
      })),
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export interface CsvCommitResult {
  error?: string;
  created?: number;
  existing?: number;
  flagged?: number;
  failed?: { rowNumber: number; errors: string[] }[];
}

export async function commitCsvAction(text: string, mapping: CsvMapping, fileName: string): Promise<CsvCommitResult> {
  try {
    const ctx = await requireRole(WRITE_ROLES);
    if (!rateLimit(`csv:${ctx.userId}`, 10, 60 * 60_000)) return { error: 'Import limit reached (10 per hour). Try again later.' };
    const parsed = parseCsv(z.string().parse(text));
    const validated = validateRows(parsed.rows, mappingSchema.parse(mapping), { source_name: `CSV: ${fileName.slice(0, 80)}` });
    const supabase = await createClient();
    const { data: run, error: runError } = await supabase
      .from('sync_runs')
      .insert({ organization_id: ctx.orgId, kind: 'csv_import', status: 'running', fetched_count: validated.length, created_by: ctx.userId })
      .select('id')
      .single();
    if (runError) return { error: runError.message };

    const vendorCache = new Map<string, string>();
    const skillMap = await loadSkillMap(supabase);
    let created = 0;
    let existing = 0;
    let flagged = 0;
    const failed: { rowNumber: number; errors: string[] }[] = [];
    for (const row of validated) {
      if (!row.ok || !row.data) {
        failed.push({ rowNumber: row.rowNumber, errors: row.errors });
        continue;
      }
      try {
        const r = await createRequirement(supabase, ctx, row.data, { syncRunId: run.id, vendorCache, skillMap, rawPayload: { row: parsed.rows[row.rowNumber - 2], file: fileName } });
        if (r.outcome === 'created') created++;
        else existing++;
        if (r.possibleDuplicates.length) flagged++;
      } catch (e) {
        failed.push({ rowNumber: row.rowNumber, errors: [errorMessage(e)] });
      }
    }
    await supabase
      .from('sync_runs')
      .update({
        status: failed.length === 0 ? 'succeeded' : created + existing > 0 ? 'partial' : 'failed',
        finished_at: new Date().toISOString(),
        created_count: created,
        duplicate_count: existing,
        error_count: failed.length,
        errors: failed.slice(0, 200),
      })
      .eq('id', run.id);
    revalidatePath('/requirements');
    revalidatePath('/dashboard');
    return { created, existing, flagged, failed: failed.slice(0, 200) };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
