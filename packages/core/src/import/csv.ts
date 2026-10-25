import Papa from 'papaparse';
import { formatZodIssues, requirementInputSchema, type RequirementInput } from '../requirements/schema';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

/** Target fields a CSV column can be mapped to. */
export const CSV_TARGET_FIELDS = [
  'title', 'description', 'skills', 'preferred_skills', 'years_experience_min', 'years_experience_max',
  'location_city', 'location_state', 'work_arrangement', 'employment_type', 'rate_min', 'rate_max', 'rate_unit',
  'currency', 'tax_terms', 'visa_requirements', 'source_job_id', 'source_name', 'original_url', 'date_posted',
  'closing_date', 'recruiter_name', 'recruiter_email', 'recruiter_phone', 'vendor_name', 'prime_vendor_name',
  'implementation_partner_name', 'end_client_name', 'submission_instructions', 'internal_notes',
] as const;
export type CsvTargetField = (typeof CSV_TARGET_FIELDS)[number];
export type CsvMapping = Partial<Record<CsvTargetField, string>>;

const HEADER_HINTS: Record<CsvTargetField, string[]> = {
  title: ['title', 'job title', 'position', 'role', 'job name'],
  description: ['description', 'job description', 'jd', 'details', 'body'],
  skills: ['skills', 'required skills', 'technologies', 'tech stack', 'primary skills'],
  preferred_skills: ['preferred skills', 'nice to have', 'secondary skills'],
  years_experience_min: ['experience', 'years experience', 'min experience', 'exp', 'years of experience'],
  years_experience_max: ['max experience'],
  location_city: ['city', 'location city'],
  location_state: ['state', 'location state', 'st'],
  work_arrangement: ['work arrangement', 'remote', 'work mode', 'onsite/remote', 'workplace'],
  employment_type: ['employment type', 'job type', 'type', 'duration type'],
  rate_min: ['rate', 'min rate', 'rate min', 'pay rate', 'bill rate', 'salary', 'salary min'],
  rate_max: ['max rate', 'rate max', 'salary max'],
  rate_unit: ['rate unit', 'pay unit', 'per'],
  currency: ['currency'],
  tax_terms: ['tax terms', 'c2c/w2', 'tax term', 'engagement', 'tax'],
  visa_requirements: ['visa', 'visa requirements', 'work authorization', 'work auth'],
  source_job_id: ['job id', 'req id', 'requisition id', 'id', 'reference', 'job code'],
  source_name: ['source', 'source name', 'board'],
  original_url: ['url', 'link', 'job url', 'job link', 'apply url'],
  date_posted: ['date posted', 'posted', 'posted date', 'date'],
  closing_date: ['closing date', 'close date', 'deadline', 'expires'],
  recruiter_name: ['recruiter', 'recruiter name', 'contact', 'contact name'],
  recruiter_email: ['recruiter email', 'email', 'contact email'],
  recruiter_phone: ['recruiter phone', 'phone', 'contact phone'],
  vendor_name: ['vendor', 'vendor company', 'company', 'staffing company'],
  prime_vendor_name: ['prime vendor', 'prime'],
  implementation_partner_name: ['implementation partner', 'partner', 'implementer', 'si'],
  end_client_name: ['client', 'end client'],
  submission_instructions: ['submission instructions', 'how to apply', 'instructions'],
  internal_notes: ['notes', 'internal notes', 'comments'],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Guesses a column mapping from header names. Each header is used at most once. */
export function suggestMapping(headers: string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const used = new Set<string>();
  for (const field of CSV_TARGET_FIELDS) {
    for (const hint of HEADER_HINTS[field]) {
      const match = headers.find((h) => !used.has(h) && norm(h) === hint);
      if (match) {
        mapping[field] = match;
        used.add(match);
        break;
      }
    }
  }
  return mapping;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const errors: string[] = [];
  if (text.length > MAX_CSV_BYTES) return { headers: [], rows: [], errors: ['File is larger than 5 MB.'] };
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  for (const e of result.errors.slice(0, 10)) errors.push(`Row ${(e.row ?? 0) + 2}: ${e.message}`);
  const headers = (result.meta.fields ?? []).filter(Boolean);
  let rows = result.data;
  if (rows.length > MAX_CSV_ROWS) {
    errors.push(`Only the first ${MAX_CSV_ROWS} rows will be imported.`);
    rows = rows.slice(0, MAX_CSV_ROWS);
  }
  return { headers, rows, errors };
}

/** Neutralizes spreadsheet formula injection when values are later exported. */
export function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export interface ValidatedRow {
  rowNumber: number;
  ok: boolean;
  data?: RequirementInput;
  errors: string[];
}

export function validateRows(
  rows: Record<string, string>[],
  mapping: CsvMapping,
  defaults: { source_name: string },
): ValidatedRow[] {
  return rows.map((row, idx) => {
    const raw: Record<string, unknown> = { source_category: 'csv', source_name: defaults.source_name };
    for (const [field, header] of Object.entries(mapping)) {
      if (!header) continue;
      const value = row[header];
      if (value !== undefined && value.trim() !== '') raw[field] = value.trim();
    }
    const parsed = requirementInputSchema.safeParse(raw);
    return parsed.success
      ? { rowNumber: idx + 2, ok: true, data: parsed.data, errors: [] }
      : { rowNumber: idx + 2, ok: false, errors: formatZodIssues(parsed.error) };
  });
}
