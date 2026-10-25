import { describe, expect, it } from 'vitest';
import { parseQuery, positiveTerms, QueryParseError, MAX_TERMS } from '../src/search/query-parser';

const term = (v: string, field: string | null = null, extra: object = {}) => ({
  type: 'term', field, values: [v], prefix: false, phrase: false, ...extra,
});

describe('parseQuery', () => {
  it('returns null for empty input', () => {
    expect(parseQuery('')).toBeNull();
    expect(parseQuery('   ')).toBeNull();
  });

  it('parses explicit AND chains from the spec examples', () => {
    expect(parseQuery('Java Developer AND AWS AND C2C')).toEqual({
      type: 'and',
      children: [term('Java'), term('Developer'), term('AWS'), term('C2C')],
    });
  });

  it('keeps special-character tech terms intact', () => {
    expect(parseQuery('.NET AND C# AND C++ AND Node.js')).toEqual({
      type: 'and',
      children: [term('.NET'), term('C#'), term('C++'), term('Node.js')],
    });
  });

  it('gives OR lower precedence than AND', () => {
    expect(parseQuery('react AND node OR angular')).toEqual({
      type: 'or',
      children: [{ type: 'and', children: [term('react'), term('node')] }, term('angular')],
    });
  });

  it('supports parentheses, NOT and leading minus', () => {
    expect(parseQuery('(java OR python) NOT intern -junior')).toEqual({
      type: 'and',
      children: [
        { type: 'or', children: [term('java'), term('python')] },
        { type: 'not', child: term('intern') },
        { type: 'not', child: term('junior') },
      ],
    });
  });

  it('parses quoted phrases, fields and prefix wildcards', () => {
    expect(parseQuery('"data engineer" state:TX title:"business analyst" snow*')).toEqual({
      type: 'and',
      children: [
        term('data engineer', null, { phrase: true }),
        term('TX', 'location'),
        term('business analyst', 'title', { phrase: true }),
        term('snow', null, { prefix: true }),
      ],
    });
  });

  it('does not treat a hyphenated word as negation', () => {
    expect(parseQuery('contract-to-hire')).toEqual(term('contract-to-hire'));
  });

  it('treats unknown field prefixes as plain text', () => {
    expect(parseQuery('foo:bar')).toEqual(term('foo:bar'));
  });

  it('tolerates unbalanced parentheses and stray operators', () => {
    expect(parseQuery('(java AND')).toEqual(term('java'));
    expect(parseQuery('AND OR java)')).toEqual(term('java'));
  });

  it('rejects overly long queries', () => {
    const q = Array.from({ length: MAX_TERMS + 1 }, (_, i) => `t${i}`).join(' ');
    expect(() => parseQuery(q)).toThrow(QueryParseError);
  });

  it('collects positive terms only', () => {
    expect(positiveTerms(parseQuery('java NOT intern (aws OR gcp)'))).toEqual(['java', 'aws', 'gcp']);
  });
});
