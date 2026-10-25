import { z } from 'zod';

export const SOURCE_CATEGORIES = ['email', 'job_board', 'vendor_portal', 'csv', 'manual', 'document'] as const;
export const WORK_ARRANGEMENTS = ['remote', 'hybrid', 'onsite'] as const;
export const EMPLOYMENT_TYPES = ['contract', 'contract_to_hire', 'full_time', 'part_time'] as const;
export const REQUIREMENT_STATUSES = ['active', 'closed', 'expired', 'duplicate', 'needs_review'] as const;
export const TAX_TERMS = ['C2C', 'W2', '1099'] as const;
export const SORTS = ['newest', 'oldest', 'relevance', 'title'] as const;

const toList = (v: string | string[] | undefined) =>
  (v === undefined ? [] : Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean);

const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => toList(v).filter((x): x is T[number] => (values as readonly string[]).includes(x)));

const freeList = z.union([z.string(), z.array(z.string())]).optional().transform(toList);

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined));

/** Search state lives in the URL so filters survive opening a job and coming back. */
export const searchParamsSchema = z.object({
  q: z.string().optional().transform((v) => (v ?? '').slice(0, 500)),
  source: enumList(SOURCE_CATEGORIES),
  sourceName: freeList,
  state: freeList.transform((s) => s.map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x))),
  skill: freeList,
  arrangement: enumList(WORK_ARRANGEMENTS),
  type: enumList(EMPLOYMENT_TYPES),
  tax: enumList(TAX_TERMS),
  status: enumList(REQUIREMENT_STATUSES),
  vendor: z
    .string()
    .optional()
    .transform((v) => (v && z.string().uuid().safeParse(v).success ? v : undefined)),
  from: optionalDate,
  to: optionalDate,
  within: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 24 * 365 ? n : undefined;
    }),
  sort: z
    .string()
    .optional()
    .transform((v) => ((SORTS as readonly string[]).includes(v ?? '') ? (v as (typeof SORTS)[number]) : 'newest')),
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 1;
    }),
});
export type SearchParams = z.output<typeof searchParamsSchema>;

export function parseSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams {
  const single: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    single[k] = Array.isArray(v) && ['q', 'vendor', 'from', 'to', 'within', 'sort', 'page'].includes(k) ? v[0] : v;
  }
  return searchParamsSchema.parse(single);
}

/** Shape expected by the `search_requirements` SQL function's p_filters argument. */
export function toDbFilters(p: SearchParams) {
  const nextDay = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };
  return {
    source_categories: p.source,
    source_names: p.sourceName,
    states: p.state,
    skills: p.skill,
    work_arrangements: p.arrangement,
    employment_types: p.type,
    tax_terms: p.tax,
    statuses: p.status,
    vendor_id: p.vendor ?? null,
    date_from: p.from ?? null,
    date_to: p.to ? nextDay(p.to) : null,
    received_within_hours: p.within ?? null,
  };
}

export function toQueryString(p: Partial<SearchParams>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
    } else if (!(k === 'page' && v === 1) && !(k === 'sort' && v === 'newest')) {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}
