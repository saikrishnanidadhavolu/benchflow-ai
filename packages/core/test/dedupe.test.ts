import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, findDuplicates, requirementFingerprint, textSimilarity } from '../src/dedupe';

describe('canonicalizeUrl', () => {
  it('strips tracking params, fragments, www and trailing slash', () => {
    expect(canonicalizeUrl('http://www.Example.com/jobs/123/?utm_source=x&b=2&a=1#apply')).toBe('https://example.com/jobs/123?a=1&b=2');
  });
  it('rejects non-http URLs', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
});

describe('findDuplicates', () => {
  const base = {
    id: 'a', title: 'Senior Java Developer', description: 'Build Spring Boot microservices on AWS for a banking client in Dallas.',
    source_name: 'csv', source_job_id: 'J-1', canonical_url: null,
    fingerprint: requirementFingerprint({ title: 'Senior Java Developer', company: 'Acme', city: 'Dallas', state: 'TX' }),
  };

  it('treats same source job ID as exact', () => {
    const m = findDuplicates({ ...base, description: 'other' }, [base]);
    expect(m[0]).toMatchObject({ id: 'a', exact: true, reasons: ['same source job ID'] });
  });

  it('treats same canonical URL as exact', () => {
    const e = { ...base, source_job_id: null, canonical_url: 'https://example.com/j/1' };
    expect(findDuplicates({ ...e, source_name: 'email' }, [e])[0]?.exact).toBe(true);
  });

  it('flags employer/title/location match for review, never exact', () => {
    const m = findDuplicates({ ...base, source_job_id: 'J-2', title: 'Sr. Java Developer', description: 'Different text entirely here.' }, [base]);
    expect(m[0]).toMatchObject({ exact: false, score: 0.85 });
  });

  it('ignores unrelated jobs', () => {
    const other = { ...base, id: 'b', source_job_id: 'X', title: 'QA Analyst', description: 'Manual testing for retail app', fingerprint: 'zzz' };
    expect(findDuplicates({ ...base, source_job_id: 'J-9' }, [other])).toEqual([]);
  });

  it('computes similarity', () => {
    expect(textSimilarity('a b c d e', 'a b c d e')).toBe(1);
    expect(textSimilarity('', 'x')).toBe(0);
  });
});
