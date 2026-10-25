import { createHash } from 'node:crypto';

const TRACKING_PARAMS = /^(utm_|gclid$|fbclid$|mc_|ref$|refid$|trk|trackingid$|src$|source$|campaign)/i;

/** Normalizes a job URL so the same listing reached via different links compares equal. */
export function canonicalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.protocol = 'https:';
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'with', 'at', 'on', 'sr', 'jr']);

export function normalizeText(input: string | null | undefined): string {
  return (input ?? '')
    .toLowerCase()
    .replace(/\bsenior\b/g, 'sr')
    .replace(/\bjunior\b/g, 'jr')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ')
    .trim();
}

/** Stable key for "same employer + title + location" matching (priority 3). */
export function requirementFingerprint(parts: {
  title: string;
  company?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  const key = [normalizeText(parts.title), normalizeText(parts.company), normalizeText(parts.city), (parts.state ?? '').toUpperCase()].join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/** Text fingerprint for near-identical descriptions (priority 4). */
export function contentHash(text: string | null | undefined): string | null {
  const n = normalizeText(text);
  if (!n) return null;
  return createHash('sha256').update(n).digest('hex');
}

function shingles(text: string, size = 3): Set<string> {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < size) {
    if (words.length) out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i <= words.length - size; i++) out.add(words.slice(i, i + size).join(' '));
  return out;
}

/** Jaccard similarity of word 3-shingles, 0..1 (priority 5 input). */
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const sa = shingles(a ?? '');
  const sb = shingles(b ?? '');
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface DedupeCandidate {
  id: string;
  title: string;
  description: string | null;
  source_name: string;
  source_job_id: string | null;
  canonical_url: string | null;
  fingerprint: string | null;
}

export interface DedupeMatch {
  id: string;
  score: number;
  reasons: string[];
  /** Exact matches are safe to treat as the same requirement; others need human review. */
  exact: boolean;
}

export const REVIEW_THRESHOLD = 0.6;

/** Applies the spec's priority order. Never auto-merges fuzzy matches. */
export function findDuplicates(
  incoming: Omit<DedupeCandidate, 'id'>,
  existing: DedupeCandidate[],
): DedupeMatch[] {
  const matches: DedupeMatch[] = [];
  for (const e of existing) {
    const reasons: string[] = [];
    if (incoming.source_job_id && e.source_job_id === incoming.source_job_id && e.source_name === incoming.source_name) {
      matches.push({ id: e.id, score: 1, reasons: ['same source job ID'], exact: true });
      continue;
    }
    if (incoming.canonical_url && e.canonical_url === incoming.canonical_url) {
      matches.push({ id: e.id, score: 1, reasons: ['same canonical URL'], exact: true });
      continue;
    }
    let score = 0;
    if (incoming.fingerprint && e.fingerprint === incoming.fingerprint) {
      score = Math.max(score, 0.85);
      reasons.push('same employer, title and location');
    }
    const hashA = contentHash(incoming.description);
    if (hashA && hashA === contentHash(e.description)) {
      score = Math.max(score, 0.95);
      reasons.push('identical description text');
    } else {
      const sim = textSimilarity(`${incoming.title} ${incoming.description ?? ''}`, `${e.title} ${e.description ?? ''}`);
      if (sim >= REVIEW_THRESHOLD) {
        score = Math.max(score, Number(sim.toFixed(3)));
        reasons.push(`description similarity ${(sim * 100).toFixed(0)}%`);
      }
    }
    if (score >= REVIEW_THRESHOLD) matches.push({ id: e.id, score, reasons, exact: false });
  }
  return matches.sort((a, b) => b.score - a.score);
}
