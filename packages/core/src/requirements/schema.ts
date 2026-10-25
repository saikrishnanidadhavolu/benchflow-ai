import { z } from 'zod';
import { EMPLOYMENT_TYPES, REQUIREMENT_STATUSES, SOURCE_CATEGORIES, TAX_TERMS, WORK_ARRANGEMENTS } from '../search/filters';
import { normalizeState } from '../search/synonyms';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional()).transform((v) => v ?? null);
const optNumber = z
  .preprocess((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[$,\s]/g, '');
      if (cleaned === '') return null;
      return Number(cleaned);
    }
    return v;
  }, z.number().finite().nonnegative().nullable())
  .optional()
  .transform((v) => v ?? null);
const optDate = z
  .preprocess(emptyToNull, z.string().nullable().optional())
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid date: ${v}` });
      return z.NEVER;
    }
    return d.toISOString().slice(0, 10);
  });
const optUrl = z
  .preprocess(emptyToNull, z.string().trim().url().max(2000).nullable().optional())
  .refine((v) => !v || /^https?:\/\//i.test(v), 'URL must start with http:// or https://')
  .transform((v) => v ?? null);

export const stringList = z
  .preprocess((v) => {
    if (v === null || v === undefined) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(/[,;|\n]/);
    return v;
  }, z.array(z.string()))
  .transform((arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, 50));

const enumOrNull = <T extends readonly [string, ...string[]]>(values: T, aliases: Record<string, T[number]> = {}) =>
  z
    .preprocess((v) => {
      if (typeof v !== 'string') return v ?? null;
      const key = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (key === '') return null;
      return aliases[key] ?? key;
    }, z.enum(values).nullable().optional())
    .transform((v) => v ?? null);

export const workArrangementField = enumOrNull(WORK_ARRANGEMENTS, {
  on_site: 'onsite',
  wfh: 'remote',
  work_from_home: 'remote',
});
export const employmentTypeField = enumOrNull(EMPLOYMENT_TYPES, {
  cth: 'contract_to_hire',
  c2h: 'contract_to_hire',
  contract_to_hire: 'contract_to_hire',
  fulltime: 'full_time',
  fte: 'full_time',
  permanent: 'full_time',
  parttime: 'part_time',
});

export const taxTermsField = stringList.transform((arr, ctx) => {
  const out: (typeof TAX_TERMS)[number][] = [];
  for (const raw of arr) {
    const v = raw.toUpperCase().replace(/[\s-]/g, '');
    const mapped = v === 'CORPTOCORP' ? 'C2C' : v;
    if ((TAX_TERMS as readonly string[]).includes(mapped)) out.push(mapped as (typeof TAX_TERMS)[number]);
    else ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown tax term "${raw}" (use C2C, W2, 1099)` });
  }
  return [...new Set(out)];
});

export const stateField = z
  .preprocess(emptyToNull, z.string().nullable().optional())
  .transform((v, ctx) => {
    if (!v) return null;
    const code = normalizeState(v);
    if (!code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown US state "${v}"` });
      return z.NEVER;
    }
    return code;
  });

/** Validated input for creating/updating a requirement manually or from CSV. */
export const requirementInputSchema = z
  .object({
    title: z.string({ error: 'Title is required' }).trim().min(1, 'Title is required').max(300),
    description: optText(50000),
    skills: stringList,
    preferred_skills: stringList,
    years_experience_min: optNumber,
    years_experience_max: optNumber,
    location_city: optText(120),
    location_state: stateField,
    work_arrangement: workArrangementField,
    employment_type: employmentTypeField,
    rate_min: optNumber,
    rate_max: optNumber,
    rate_unit: enumOrNull(['hour', 'day', 'month', 'year'] as const, {
      hr: 'hour',
      hourly: 'hour',
      per_hour: 'hour',
      annual: 'year',
      yearly: 'year',
      annually: 'year',
      daily: 'day',
      monthly: 'month',
    }),
    currency: z
      .preprocess(emptyToNull, z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional())
      .transform((v) => v ?? 'USD'),
    tax_terms: taxTermsField,
    visa_requirements: stringList,
    source_job_id: optText(200),
    source_name: z
      .preprocess(emptyToNull, z.string().trim().max(120).nullable().optional())
      .transform((v) => v ?? 'manual'),
    source_category: enumOrNull(SOURCE_CATEGORIES).transform((v) => v ?? 'manual'),
    original_url: optUrl,
    date_posted: optDate,
    closing_date: optDate,
    recruiter_name: optText(200),
    recruiter_email: z
      .preprocess(emptyToNull, z.string().trim().email().max(320).nullable().optional())
      .transform((v) => v ?? null),
    recruiter_phone: optText(50),
    vendor_name: optText(200),
    prime_vendor_name: optText(200),
    implementation_partner_name: optText(200),
    end_client_name: optText(200),
    submission_instructions: optText(5000),
    internal_notes: optText(10000),
    status: enumOrNull(REQUIREMENT_STATUSES).transform((v) => v ?? 'active'),
  })
  .superRefine((v, ctx) => {
    if (v.rate_min !== null && v.rate_max !== null && v.rate_max < v.rate_min)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rate_max'], message: 'Max rate is below min rate' });
    if (v.years_experience_min !== null && v.years_experience_max !== null && v.years_experience_max < v.years_experience_min)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['years_experience_max'], message: 'Max experience is below min' });
    if ((v.rate_min !== null || v.rate_max !== null) && v.rate_unit === null)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rate_unit'], message: 'Rate unit is required when a rate is given' });
  });

export type RequirementInput = z.output<typeof requirementInputSchema>;
export type RequirementRawInput = z.input<typeof requirementInputSchema>;

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}
