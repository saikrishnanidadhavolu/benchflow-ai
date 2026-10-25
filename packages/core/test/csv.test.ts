import { describe, expect, it } from 'vitest';
import { parseCsv, sanitizeCell, suggestMapping, validateRows } from '../src/import/csv';

const CSV = `Job Title,Skills,City,State,Rate,Rate Unit,Tax Terms,Job ID,URL,Vendor
Java Developer,"Java, Spring Boot, AWS",Dallas,Texas,$65,hr,"C2C, W2",J-100,https://example.com/j/100,Acme Staffing
,Python,Austin,TX,,,,J-101,,
Data Engineer,Snowflake;dbt,Newark,ZZ,70,hour,C2C,J-102,ftp://bad,`;

describe('CSV import', () => {
  it('parses and suggests a mapping', () => {
    const parsed = parseCsv(CSV);
    expect(parsed.headers).toContain('Job Title');
    expect(parsed.rows).toHaveLength(3);
    const m = suggestMapping(parsed.headers);
    expect(m).toMatchObject({ title: 'Job Title', skills: 'Skills', location_state: 'State', rate_min: 'Rate', source_job_id: 'Job ID', original_url: 'URL', vendor_name: 'Vendor' });
  });

  it('validates rows with precise errors', () => {
    const parsed = parseCsv(CSV);
    const rows = validateRows(parsed.rows, suggestMapping(parsed.headers), { source_name: 'test.csv' });
    expect(rows[0]).toMatchObject({ ok: true, data: { title: 'Java Developer', location_state: 'TX', rate_min: 65, rate_unit: 'hour', tax_terms: ['C2C', 'W2'], skills: ['Java', 'Spring Boot', 'AWS'], source_category: 'csv', source_name: 'test.csv' } });
    expect(rows[1]?.ok).toBe(false);
    expect(rows[1]?.errors.join()).toMatch(/title/);
    expect(rows[2]?.ok).toBe(false);
    expect(rows[2]?.errors.join()).toMatch(/Unknown US state/);
    expect(rows[2]?.errors.join()).toMatch(/original_url/);
  });

  it('neutralizes formula injection', () => {
    expect(sanitizeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(sanitizeCell('Java')).toBe('Java');
  });
});
