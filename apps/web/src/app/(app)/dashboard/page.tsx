import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, STATUS_TONE } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { formatDate, label } from '@/lib/utils';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

interface Bucket { label: string; count: number; category?: string }
interface Stats {
  total: number; new_today: number; from_email: number; from_job_boards: number; unique_after_dedupe: number;
  active: number; needs_review: number; by_technology: Bucket[]; by_state: Bucket[]; by_visa: Bucket[];
  by_source: Bucket[]; by_date: { date: string; count: number }[];
  recently_expired: { id: string; title: string; status: string; closing_date: string | null; updated_at: string }[];
}

function Stat({ title, value, href }: { title: string; value: number; href?: string }) {
  const body = (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardBody>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
        <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value.toLocaleString()}</div>
      </CardBody>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function BarList({ items, hrefFor, empty }: { items: Bucket[]; hrefFor: (b: Bucket) => string; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={`${i.label}-${i.category ?? ''}`}>
          <Link href={hrefFor(i)} className="group block">
            <div className="flex justify-between text-sm">
              <span className="truncate text-slate-700 group-hover:text-brand-700">{i.label}</span>
              <span className="tabular-nums text-slate-500">{i.count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('dashboard_stats', { p_org: ctx.orgId, p_tz: env.APP_TIMEZONE });
  if (error || !data) throw new Error('Could not load dashboard statistics.');
  const s = data as Stats;
  const maxDay = Math.max(1, ...s.by_date.map((d) => d.count));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live counts from your requirements database."
        actions={
          <>
            <Link href="/requirements/new" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add requirement</Link>
            <Link href="/requirements/import" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Import CSV</Link>
          </>
        }
      />
      {s.total === 0 && (
        <Card className="mb-6 border-dashed">
          <CardBody className="text-sm text-slate-600">
            No requirements yet. <Link className="text-brand-600 underline" href="/requirements/new">Add one manually</Link> or{' '}
            <Link className="text-brand-600 underline" href="/requirements/import">import a CSV</Link>. Email and job-board sync arrive in later phases.
          </CardBody>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat title="Total collected" value={s.total} href="/requirements?status=active,closed,expired,duplicate,needs_review" />
        <Stat title="New today" value={s.new_today} href="/requirements?within=24" />
        <Stat title="From email" value={s.from_email} href="/requirements?source=email" />
        <Stat title="From job boards" value={s.from_job_boards} href="/requirements?source=job_board" />
        <Stat title="Unique (deduplicated)" value={s.unique_after_dedupe} href="/requirements" />
        <Stat title="Needs review" value={s.needs_review} href="/requirements?status=needs_review" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Requirements received, last 14 days" description={`Times in ${env.APP_TIMEZONE}`} />
          <CardBody>
            <div className="flex h-40 items-end gap-1" role="img" aria-label="Requirements received per day">
              {s.by_date.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500">{d.count || ''}</span>
                  <div className="w-full rounded-t bg-brand-500/80" style={{ height: `${(d.count / maxDay) * 120}px`, minHeight: d.count ? 4 : 1 }} title={`${d.date}: ${d.count}`} />
                  <span className="hidden text-[10px] text-slate-400 sm:block">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By source" />
          <CardBody>
            <BarList items={s.by_source} empty="No sources yet." hrefFor={(b) => `/requirements?sourceName=${encodeURIComponent(b.label)}`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By technology" />
          <CardBody>
            <BarList items={s.by_technology} empty="No skills recorded yet." hrefFor={(b) => `/requirements?skill=${encodeURIComponent(b.label)}`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By US state" />
          <CardBody>
            <BarList items={s.by_state} empty="No locations recorded yet." hrefFor={(b) => `/requirements?state=${b.label}`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By visa category" description="Only where the requirement states it" />
          <CardBody>
            <BarList items={s.by_visa} empty="No visa requirements stated." hrefFor={(b) => `/requirements?q=${encodeURIComponent(`"${b.label}"`)}`} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Recently expired or potentially closed" />
          <CardBody>
            {s.recently_expired.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing expired or closed.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.recently_expired.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/requirements/${r.id}`} className="truncate text-sm text-slate-800 hover:text-brand-700">{r.title}</Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.closing_date && <span className="text-xs text-slate-500">Closed {formatDate(r.closing_date)}</span>}
                      <Badge tone={STATUS_TONE[r.status]}>{label(r.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
