/**
 * Boolean search parser.
 *
 * Grammar (case-insensitive operators):
 *   expr    := orExpr
 *   orExpr  := andExpr ("OR" andExpr)*
 *   andExpr := unary (("AND")? unary)*      // adjacency = AND
 *   unary   := ("NOT" | "-") unary | primary
 *   primary := "(" expr ")" | field ":" value | value
 *   value   := quoted phrase | word, optional trailing "*" for prefix match
 */

export const SEARCH_FIELDS = [
  'title',
  'skill',
  'location',
  'jobid',
  'sender',
  'recruiter',
  'type',
  'source',
  'vendor',
  'prime',
  'partner',
  'client',
  'company',
  'status',
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

const FIELD_ALIASES: Record<string, SearchField> = {
  title: 'title',
  skill: 'skill',
  skills: 'skill',
  tech: 'skill',
  location: 'location',
  loc: 'location',
  state: 'location',
  city: 'location',
  jobid: 'jobid',
  id: 'jobid',
  sender: 'sender',
  from: 'sender',
  recruiter: 'recruiter',
  type: 'type',
  source: 'source',
  vendor: 'vendor',
  prime: 'prime',
  partner: 'partner',
  implementer: 'partner',
  client: 'client',
  company: 'company',
  status: 'status',
};

export type QueryNode =
  | { type: 'and'; children: QueryNode[] }
  | { type: 'or'; children: QueryNode[] }
  | { type: 'not'; child: QueryNode }
  | { type: 'term'; field: SearchField | null; values: string[]; prefix: boolean; phrase: boolean };

type Token =
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'and' }
  | { kind: 'or' }
  | { kind: 'not' }
  | { kind: 'word'; text: string; quoted: boolean; field: SearchField | null };

export const MAX_QUERY_LENGTH = 500;
export const MAX_TERMS = 40;

export class QueryParseError extends Error {}

export function tokenize(input: string): Token[] {
  const s = input.slice(0, MAX_QUERY_LENGTH);
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch) || ch === ',') {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === '-' && i + 1 < s.length && !/\s/.test(s[i + 1]!) && (i === 0 || /[\s(]/.test(s[i - 1]!))) {
      tokens.push({ kind: 'not' });
      i++;
      continue;
    }

    let field: SearchField | null = null;
    const fieldMatch = /^([a-zA-Z]+):(?=\S)/.exec(s.slice(i));
    if (fieldMatch && FIELD_ALIASES[fieldMatch[1]!.toLowerCase()]) {
      field = FIELD_ALIASES[fieldMatch[1]!.toLowerCase()]!;
      i += fieldMatch[0].length;
    }

    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1);
      const text = s.slice(i + 1, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end + 1;
      if (text.trim()) tokens.push({ kind: 'word', text: text.trim(), quoted: true, field });
      continue;
    }

    let j = i;
    while (j < s.length && !/[\s()",]/.test(s[j]!)) j++;
    const text = s.slice(i, j);
    i = j;
    if (!text) continue;
    if (!field) {
      const upper = text.toUpperCase();
      if (upper === 'AND' || text === '&&') {
        tokens.push({ kind: 'and' });
        continue;
      }
      if (upper === 'OR' || text === '||') {
        tokens.push({ kind: 'or' });
        continue;
      }
      if (upper === 'NOT') {
        tokens.push({ kind: 'not' });
        continue;
      }
    }
    tokens.push({ kind: 'word', text, quoted: false, field });
  }
  return tokens;
}

export function parseQuery(input: string): QueryNode | null {
  const tokens = tokenize(input);
  let pos = 0;
  let termCount = 0;

  const peek = () => tokens[pos];

  function parseOr(): QueryNode | null {
    const children: QueryNode[] = [];
    const first = parseAnd();
    if (first) children.push(first);
    while (peek()?.kind === 'or') {
      pos++;
      const next = parseAnd();
      if (next) children.push(next);
    }
    if (children.length === 0) return null;
    return children.length === 1 ? children[0]! : { type: 'or', children };
  }

  function parseAnd(): QueryNode | null {
    const children: QueryNode[] = [];
    for (;;) {
      const t = peek();
      if (!t || t.kind === 'or') break;
      if (t.kind === 'rparen') {
        if (depth > 0) break;
        pos++;
        continue;
      }
      if (t.kind === 'and') {
        pos++;
        continue;
      }
      const node = parseUnary();
      if (node) children.push(node);
    }
    if (children.length === 0) return null;
    return children.length === 1 ? children[0]! : { type: 'and', children };
  }

  function parseUnary(): QueryNode | null {
    const t = peek();
    if (t?.kind === 'not') {
      pos++;
      const child = parseUnary();
      return child ? { type: 'not', child } : null;
    }
    return parsePrimary();
  }

  let depth = 0;
  function parsePrimary(): QueryNode | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === 'lparen') {
      pos++;
      depth++;
      const inner = parseOr();
      depth--;
      if (peek()?.kind === 'rparen') pos++;
      return inner;
    }
    if (t.kind === 'word') {
      pos++;
      termCount++;
      if (termCount > MAX_TERMS) throw new QueryParseError(`Too many search terms (max ${MAX_TERMS}).`);
      let text = t.text;
      let prefix = false;
      if (!t.quoted && text.length > 1 && text.endsWith('*')) {
        prefix = true;
        text = text.slice(0, -1);
      }
      return { type: 'term', field: t.field, values: [text], prefix, phrase: t.quoted };
    }
    // Stray operator – skip it.
    pos++;
    return null;
  }

  return parseOr();
}

/** Collects positive (non-negated) term text, used for relevance ranking. */
export function positiveTerms(node: QueryNode | null, negated = false): string[] {
  if (!node) return [];
  switch (node.type) {
    case 'and':
    case 'or':
      return node.children.flatMap((c) => positiveTerms(c, negated));
    case 'not':
      return positiveTerms(node.child, !negated);
    case 'term':
      return negated ? [] : [node.values[0]!];
  }
}
