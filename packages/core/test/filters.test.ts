import { describe, expect, it } from 'vitest';
import { parseSearchParams, toDbFilters, toQueryString } from '../src/search/filters';

describe('search params', () => {
  it('parses and round-trips URL state', () => {
    const p = parseSearchParams({ q: 'java AND aws', state: 'tx,nj', arrangement: 'remote', page: '3', sort: 'relevance' });
    expect(p).toMatchObject({ q: 'java AND aws', state: ['TX', 'NJ'], arrangement: ['remote'], page: 3, sort: 'relevance' });
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(toQueryString(p))))).toEqual(p);
  });

  it('drops invalid values instead of failing', () => {
    const p = parseSearchParams({ arrangement: 'remote,moon', page: '-4', vendor: 'not-a-uuid', from: '2026-13-99x', sort: 'evil' });
    expect(p.arrangement).toEqual(['remote']);
    expect(p.page).toBe(1);
    expect(p.vendor).toBeUndefined();
    expect(p.from).toBeUndefined();
    expect(p.sort).toBe('newest');
  });

  it('makes date_to inclusive of the selected day', () => {
    const f = toDbFilters(parseSearchParams({ from: '2026-10-01', to: '2026-10-31', within: '24' }));
    expect(f.date_from).toBe('2026-10-01');
    expect(f.date_to).toBe('2026-11-01');
    expect(f.received_within_hours).toBe(24);
  });
});
