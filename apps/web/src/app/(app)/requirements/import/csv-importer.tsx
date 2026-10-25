'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { CSV_TARGET_FIELDS, MAX_CSV_BYTES, type CsvMapping } from '@benchflow/core/import/csv';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { commitCsvAction, previewCsvAction, type CsvCommitResult, type CsvPreview } from '../actions';

const FIELD_LABELS: Record<string, string> = {
  title: 'Job title *', source_job_id: 'Job ID', original_url: 'Job URL', location_state: 'State', location_city: 'City',
  rate_min: 'Rate (min)', rate_max: 'Rate (max)', vendor_name: 'Vendor', prime_vendor_name: 'Prime vendor',
  implementation_partner_name: 'Implementation partner', end_client_name: 'End client', tax_terms: 'C2C/W2/1099',
};

export function CsvImporter() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [result, setResult] = useState<CsvCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    setError(null);
    setResult(null);
    setPreview(null);
    if (!f) return;
    if (f.size > MAX_CSV_BYTES) return setError('File is larger than 5 MB.');
    if (!/\.(csv|txt)$/i.test(f.name)) return setError('Please choose a .csv file.');
    const text = await f.text();
    setFile({ name: f.name, text });
    start(async () => {
      const p = await previewCsvAction(text, null, f.name);
      if (p.error) setError(p.error);
      setPreview(p);
      setMapping(p.mapping ?? {});
    });
  }

  function remap(field: string, header: string) {
    const next = { ...mapping, [field]: header || undefined } as CsvMapping;
    if (!header) delete (next as Record<string, string | undefined>)[field];
    setMapping(next);
    if (file) start(async () => setPreview(await previewCsvAction(file.text, next, file.name)));
  }

  function commit() {
    if (!file) return;
    start(async () => {
      const r = await commitCsvAction(file.text, mapping, file.name);
      if (r.error) setError(r.error);
      else setResult(r);
    });
  }

  if (result) {
    return (
      <Card>
        <CardHeader title="Import finished" />
        <CardBody className="space-y-3 text-sm">
          <p>
            <strong>{result.created}</strong> created · <strong>{result.existing}</strong> linked to existing requirements ·{' '}
            <strong>{result.flagged}</strong> flagged as possible duplicates · <strong>{result.failed?.length ?? 0}</strong> failed
          </p>
          {!!result.failed?.length && (
            <ul className="max-h-60 list-disc overflow-auto pl-5 text-red-700">
              {result.failed.map((f) => <li key={f.rowNumber}>Row {f.rowNumber}: {f.errors.join('; ')}</li>)}
            </ul>
          )}
          <Link href="/requirements?source=csv" className="text-brand-700 underline">View imported requirements</Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="1. Choose a file" description="CSV with a header row, up to 5 MB / 5,000 rows." />
        <CardBody>
          <label htmlFor="csv-file" className="sr-only">CSV file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block text-sm file:mr-4 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          {pending && <p className="mt-3 text-sm text-slate-500">Working…</p>}
        </CardBody>
      </Card>
      {preview?.headers && (
        <>
          <Card>
            <CardHeader title="2. Map columns" description="We guessed based on header names. Unmapped fields stay empty." />
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CSV_TARGET_FIELDS.map((f) => (
                <label key={f} className="text-sm">
                  <span className="mb-1 block text-slate-700">{FIELD_LABELS[f] ?? f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</span>
                  <Select value={mapping[f] ?? ''} onChange={(e) => remap(f, e.target.value)}>
                    <option value="">— not mapped —</option>
                    {preview.headers!.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </label>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="3. Review"
              description={`${preview.validRows} of ${preview.totalRows} rows are valid. Invalid rows are skipped and reported.`}
              action={<Button onClick={commit} disabled={pending || !preview.validRows}>{pending ? 'Importing…' : `Import ${preview.validRows} rows`}</Button>}
            />
            <CardBody className="overflow-x-auto">
              {!!preview.parseErrors?.length && <ul className="mb-3 text-sm text-amber-700">{preview.parseErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-2 pr-3">Row</th><th className="pr-3">Status</th><th className="pr-3">Title</th><th className="pr-3">Location</th><th>Skills / errors</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample?.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="py-2 pr-3 tabular-nums text-slate-500">{r.rowNumber}</td>
                      <td className="pr-3">{r.ok ? <Badge tone="green">Valid</Badge> : <Badge tone="red">Error</Badge>}</td>
                      <td className="pr-3">{r.title ?? '—'}</td>
                      <td className="pr-3">{r.location || '—'}</td>
                      <td className={r.ok ? 'text-slate-600' : 'text-red-700'}>{r.ok ? r.skills?.join(', ') : r.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(preview.totalRows ?? 0) > 50 && <p className="mt-2 text-xs text-slate-500">Showing first 50 rows.</p>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
