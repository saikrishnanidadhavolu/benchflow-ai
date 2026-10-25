import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LABELS: Record<string, string> = {
  contract_to_hire: 'Contract-to-hire',
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'Onsite',
  needs_review: 'Needs review',
  job_board: 'Job board',
  vendor_portal: 'Vendor portal',
  prime_vendor: 'Prime vendor',
  implementation_partner: 'Implementation partner',
  end_client: 'End client',
};

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

export function formatRate(r: {
  rate_min: number | null;
  rate_max: number | null;
  rate_unit: string | null;
  currency?: string | null;
}): string | null {
  if (r.rate_min == null && r.rate_max == null) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: r.currency || 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
  const range = r.rate_min != null && r.rate_max != null && r.rate_max !== r.rate_min ? `${fmt(r.rate_min)}–${fmt(r.rate_max)}` : fmt((r.rate_min ?? r.rate_max)!);
  return r.rate_unit ? `${range}/${r.rate_unit === 'hour' ? 'hr' : r.rate_unit}` : range;
}

export function formatDateTime(iso: string | null | undefined, tz = process.env.APP_TIMEZONE || 'America/New_York') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
}
