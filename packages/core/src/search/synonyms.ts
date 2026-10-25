import type { QueryNode } from './query-parser';

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

const STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

/** Returns the 2-letter code for a state name or code, or null. */
export function normalizeState(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim();
  if (/^[A-Za-z]{2}$/.test(v) && US_STATES[v.toUpperCase()]) return v.toUpperCase();
  return STATE_BY_NAME.get(v.toLowerCase()) ?? null;
}

/**
 * State codes that are also common English words or IT abbreviations. These are never
 * treated as states unless the user targets the location field (e.g. `state:IN`).
 */
export const AMBIGUOUS_STATE_CODES = new Set([
  'AL', 'AR', 'CO', 'DE', 'HI', 'ID', 'IN', 'LA', 'MA', 'ME', 'MS', 'OH', 'OK', 'OR', 'PA', 'PR', 'SD',
]);

/**
 * Returns the state code when a free-text term should be read as a US state: exactly two letters,
 * typed in uppercase (e.g. "TX", not "tx"), a valid code, and not an ambiguous word like "IN" or "OR".
 */
export function stateCodeForFreeTextTerm(term: string): string | null {
  if (!/^[A-Z]{2}$/.test(term)) return null;
  if (!US_STATES[term] || AMBIGUOUS_STATE_CODES.has(term)) return null;
  return term;
}

/** Built-in staffing vocabulary synonyms (in addition to skill aliases stored in the DB). */
const BUILT_IN_GROUPS: string[][] = [
  ['c2c', 'corp to corp', 'corp-to-corp'],
  ['w2', 'w-2'],
  ['h1b', 'h-1b', 'h1-b'],
  ['h1b transfer', 'h-1b transfer'],
  ['gc', 'green card'],
  ['usc', 'us citizen', 'u.s. citizen'],
  ['remote', 'work from home', 'wfh'],
  ['onsite', 'on-site', 'on site'],
  ['cth', 'contract to hire', 'contract-to-hire', 'c2h'],
  ['full time', 'full-time', 'fte'],
];

export interface SkillSynonym {
  name: string;
  aliases: string[];
}

export class SynonymIndex {
  private readonly map = new Map<string, string[]>();

  constructor(skills: SkillSynonym[] = []) {
    const groups = [...BUILT_IN_GROUPS, ...skills.map((s) => [s.name, ...s.aliases])];
    for (const group of groups) {
      const unique = [...new Set(group.map((g) => g.trim()).filter(Boolean))];
      for (const term of unique) {
        const key = term.toLowerCase();
        const existing = this.map.get(key) ?? [];
        this.map.set(key, [...new Set([...existing, ...unique])]);
      }
    }
    for (const [code, name] of Object.entries(US_STATES)) {
      this.map.set(name.toLowerCase(), [name, code]);
    }
  }

  expand(term: string): string[] {
    const syns = this.map.get(term.trim().toLowerCase());
    if (!syns) return [term];
    return [...new Set([term, ...syns.filter((s) => s.toLowerCase() !== term.toLowerCase())])];
  }
}

/** Expands each term node's values with synonyms. Prefix, status and job-id terms are left as typed. */
export function expandSynonyms(node: QueryNode | null, index: SynonymIndex): QueryNode | null {
  if (!node) return null;
  switch (node.type) {
    case 'and':
    case 'or':
      return { ...node, children: node.children.map((c) => expandSynonyms(c, index)).filter((c): c is QueryNode => !!c) };
    case 'not': {
      const child = expandSynonyms(node.child, index);
      return child ? { ...node, child } : null;
    }
    case 'term': {
      if (node.prefix || node.field === 'status' || node.field === 'jobid') return node;
      const base = node.values[0]!;
      let values = index.expand(base);
      if (node.field === 'location') {
        // Explicit location field: any state code or name expands, including ambiguous ones like "IN".
        const code = normalizeState(base);
        if (code) values = [...new Set([...values, code, US_STATES[code]!])];
      } else if (!node.field && !node.phrase) {
        // Free text: only unambiguous uppercase codes ("TX", "NJ") also match the state name.
        const code = stateCodeForFreeTextTerm(base);
        if (code) values = [...new Set([...values, US_STATES[code]!])];
      }
      return { ...node, values };
    }
  }
}
