import Link from 'next/link';
import { parseSearchParams, toQueryString, type SearchParams } from '@benchflow/core';
import { ExternalLink } from 'lucide-react';
import { Badge, STATUS_TONE } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { requireContext, canWrite } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, searchRequirements } from '@/lib/search';
import { formatDateTime, formatRate, label } from '@/lib/utils';
import { SearchFilters } from './search-filters';

export const metadata = { title: 'All Requirements' };
export const dynamic = 'force-dynamic';

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireContext();
  const params = parseSearchParams(await searchParams);
  const supabase = await createClient();
  const [{ total, rows, parseError }, vendorsRes, sourcesRes] = await Promise.all([
    searchRequirements(supabase, ctx.orgId, params),
    supabase.from('vendors').select('id, name').eq('organization_id', ctx.orgId).order('name').limit(500),
    supabase.from('job_requirements').select('source_name').eq('organization_id', ctx.orgId).limit(2000),
  ]);
  const sourceNames = [...new Set((sourcesRes.data ?? []).map((r) => r.source_name))].sort();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = toQueryString(params);
  const pageHref = (page: number) => `/requirements?${toQueryString({ ...params, page } as Partial<SearchParams>)}`;

  return (
    <>
      <PageHeader
        title="All Requirements"
        description="Boolean search across every source. Filters are kept in the URL."
        actions={
          canWrite(ctx.role) ? (
            <>
              <Link href="/requirements/new" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add requirement</Link>
              <Link href="/requirements/import" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Import CSV</Link>
            </>
          ) : undefined
        }
      />
      <SearchFilters params={params} vendors={vendorsRes.data ?? []} sourceNames={sourceNames} />
      {parseError && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{parseError}</p>}
      <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
        <span aria-live="polite">
          {total.toLocaleString()} {total === 1 ? 'requirement' : 'requirements'}
        </span>
        {pages > 1 && <span>Page {params.page} of {pages}</span>}
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No requirements match this search.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const rate = formatRate(r);
              const loc = [r.location_city, r.location_state].filter(Boolean).join(', ');
              return (
                <li key={r.id} className="px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/requirements/${r.id}${qs ? `?from=${encodeURIComponent(qs)}` : ''}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {r.title}
                        </Link>
                        <Badge tone={STATUS_TONE[r.status]}>{label(r.status)}</Badge>
                        {r.original_url && (
                          <a href={r.original_url} target="_blank" rel="noopener noreferrer nofollow" className="text-slate-400 hover:text-brand-600" aria-label="Open original listing">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                        {loc && <span>{loc}</span>}
                        {r.work_arrangement && <span>{label(r.work_arrangement)}</span>}
                        {r.employment_type && <span>{label(r.employment_type)}</span>}
                        {rate && <span className="font-medium text-slate-700">{rate}</span>}
                        {r.tax_terms.length > 0 && <span>{r.tax_terms.join(' / ')}</span>}
                        {r.vendor_name && <span>Vendor: {r.vendor_name}</span>}
                        {r.end_client_name && <span>Client: {r.end_client_name}</span>}
                      </div>
                      {r.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.skills.slice(0, 8).map((s) => (
                            <Badge key={s} tone="blue">{s}</Badge>
                          ))}
                          {r.visa_requirements.map((v) => (
                            <Badge key={v} tone="purple">{v}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-left text-xs text-slate-500 sm:text-right">
                      <div>{r.source_name}</div>
                      <div>{formatDateTime(r.date_received)}</div>
                      {r.source_job_id && <div className="font-mono">{r.source_job_id}</div>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex justify-center gap-2" aria-label="Pagination">
          {params.page > 1 && <Link href={pageHref(params.page - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Previous</Link>}
          {params.page < pages && <Link href={pageHref(params.page + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Next</Link>}
        </nav>
      )}
    </>
  );
}
