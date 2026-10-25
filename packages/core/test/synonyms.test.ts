import { describe, expect, it } from 'vitest';
import { parseQuery } from '../src/search/query-parser';
import { expandSynonyms, normalizeState, SynonymIndex } from '../src/search/synonyms';

const index = new SynonymIndex([
  { name: 'React', aliases: ['ReactJS', 'React.js'] },
  { name: 'Kubernetes', aliases: ['k8s'] },
]);

describe('synonyms', () => {
  it('expands skill aliases in both directions', () => {
    expect(index.expand('reactjs')).toEqual(['reactjs', 'React', 'React.js']);
    expect(index.expand('k8s')).toContain('Kubernetes');
  });

  it('expands staffing vocabulary and state names', () => {
    expect(index.expand('C2C')).toContain('corp to corp');
    expect(index.expand('Texas')).toEqual(['Texas', 'TX']);
  });

  it('does not expand bare 2-letter codes outside the location field', () => {
    const plain = expandSynonyms(parseQuery('IN'), index);
    expect(plain).toMatchObject({ values: ['IN'] });
    const loc = expandSynonyms(parseQuery('state:NJ'), index);
    expect(loc).toMatchObject({ field: 'location', values: ['NJ', 'New Jersey'] });
  });

  it('leaves prefix, status and job id terms untouched', () => {
    expect(expandSynonyms(parseQuery('react*'), index)).toMatchObject({ values: ['react'], prefix: true });
    expect(expandSynonyms(parseQuery('status:active'), index)).toMatchObject({ values: ['active'] });
  });

  it('normalizes states', () => {
    expect(normalizeState('new jersey')).toBe('NJ');
    expect(normalizeState('tx')).toBe('TX');
    expect(normalizeState('Atlantis')).toBeNull();
  });
});
