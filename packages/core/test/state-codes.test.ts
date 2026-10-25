import { describe, expect, it } from 'vitest';
import { parseQuery, type QueryNode } from '../src/search/query-parser';
import { expandSynonyms, stateCodeForFreeTextTerm, SynonymIndex } from '../src/search/synonyms';

const index = new SynonymIndex([{ name: 'QA Automation', aliases: ['test automation'] }]);
const expand = (q: string) => expandSynonyms(parseQuery(q), index);
const terms = (n: QueryNode | null): { field: string | null; values: string[] }[] =>
  !n ? [] : n.type === 'term' ? [{ field: n.field, values: n.values }] : n.type === 'not' ? terms(n.child) : n.children.flatMap(terms);

describe('two-letter search terms', () => {
  it('expands an uppercase, unambiguous state code typed as free text', () => {
    expect(expand('TX')).toMatchObject({ field: null, values: ['TX', 'Texas'] });
    expect(expand('NJ')).toMatchObject({ values: ['NJ', 'New Jersey'] });
  });

  it('expands state codes inside Boolean queries without touching other terms', () => {
    expect(terms(expand('Data Engineer AND Snowflake AND TX'))).toEqual([
      { field: null, values: ['Data'] },
      { field: null, values: ['Engineer'] },
      { field: null, values: ['Snowflake'] },
      { field: null, values: ['TX', 'Texas'] },
    ]);
  });

  it('leaves ordinary two-letter keywords literal', () => {
    for (const q of ['QA', 'AI', 'ML', 'UI', 'BA', 'PM', 'ai']) {
      expect(expand(q)).toMatchObject({ values: [q] });
    }
  });

  it('does not treat lowercase codes or ambiguous words as states in free text', () => {
    for (const q of ['tx', 'in', 'IN', 'ME', 'OK', 'HI', 'CO', 'PA', 'MS', 'LA', 'DE', 'ID']) {
      expect(expand(q)).toMatchObject({ values: [q] });
    }
    expect(stateCodeForFreeTextTerm('IN')).toBeNull();
    expect(stateCodeForFreeTextTerm('tx')).toBeNull();
    expect(stateCodeForFreeTextTerm('ZZ')).toBeNull();
  });

  it('expands ambiguous and lowercase codes when the state field is explicit', () => {
    expect(expand('state:IN')).toMatchObject({ field: 'location', values: ['IN', 'Indiana'] });
    expect(expand('state:tx')).toMatchObject({ field: 'location', values: ['tx', 'TX', 'Texas'] });
    expect(expand('location:"New Jersey"')).toMatchObject({ field: 'location', values: ['New Jersey', 'NJ'] });
  });

  it('keeps quoted codes literal and returns null for empty queries', () => {
    expect(expand('"TX"')).toMatchObject({ values: ['TX'], phrase: true });
    expect(expand('')).toBeNull();
    expect(expand('   ')).toBeNull();
  });

  it('expands state codes under NOT as well, so exclusions cover the state name', () => {
    expect(expand('java -CA')).toEqual({
      type: 'and',
      children: [
        { type: 'term', field: null, values: ['java'], prefix: false, phrase: false },
        { type: 'not', child: { type: 'term', field: null, values: ['CA', 'California'], prefix: false, phrase: false } },
      ],
    });
  });
});
