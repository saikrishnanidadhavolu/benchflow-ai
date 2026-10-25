import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Badge, STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { canWrite, requireContext, ADMIN_ROLES } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatDateTime, formatRate, label } from '@/lib/utils';
import { deleteRequirementAction, resolveDuplicateAction, saveNotesAction, setStatusAction } from '../actions';

export const dynamic = 'force-dynamic';

const STATUSES = ['active', 'closed', 'expired', 'duplicate', 'needs_review'] as const;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2 break-words text-slate-900">{v ?? <span className="text-slate-400">Not stated</span>}</dd>
    </div>
  );
}

export default async function RequirementDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from('job_requirements')
    .select('*, vendor:vendors!job_requirements_vendor_id_fkey(id,name), prime:vendors!job_requirements_prime_vendor_id_fkey(id,name), partner:vendors!job_requirements_implementation_partner_id_fkey(id,name), client:vendors!job_requirements_end_client_id_fkey(id,name)')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!r) notFound();

  const [sources, dupes, audit] = await Promise.all([
    supabase.from('requirement_sources').select('id, source_name, source_category, url, sender, seen_at').eq('requirement_id', id).order('seen_at', { ascending: false }),
    supabase
      .from('duplicate_candidates')
      .select('id, score, reasons, status, requirement_a, requirement_b, a:job_requirements!duplicate_candidates_requirement_a_fkey(id,title,source_name), b:job_requirements!duplicate_candidates_requirement_b_fkey(id,title,source_name)')
      .or(`requirement_a.eq.${id},requirement_b.eq.${id}`)
      .eq('status', 'pending'),
    supabase.from('audit_logs').select('id, action, actor_user_id, diff, created_at').eq('entity_type', 'job_requirements').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
  ]);

  const writable = canWrite(ctx.role);
  const backHref = `/requirements${from ? `?${from}` : ''}`;
  const rate = formatRate(r);
  const company = (v: { id: string; name: string } | null) => (v ? <Link className="text-brand-700 hover:underline" href={`/vendors/${v.id}`}>{v.name}</Link> : null);
  const list = (a: string[]) => (a.length ? a.join(', ') : null);

  return (
    <>
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Back to results
      </Link>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
            <Badge tone={STATUS_TONE[r.status]}>{label(r.status)}</Badge>
            <Badge tone={r.verification_status === 'verified' ? 'green' : 'slate'}>{label(r.verification_status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {r.source_name} · received {formatDateTime(r.date_received)} · last seen {formatDateTime(r.last_seen_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.original_url && (
            <a href={r.original_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-300 bg-white px-4 text-sm hover:bg-slate-50">
              Original listing <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {writable && <Link href={`/requirements/${id}/edit`} className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Edit</Link>}
        </div>
      </div>

      {(dupes.data ?? []).length > 0 && (
        <Card className="mb-6 border-amber-300">
          <CardHeader title="Possible duplicates – review needed" description="These were not merged automatically." />
          <CardBody className="space-y-3">
            {(dupes.data ?? []).map((d) => {
              const other = (d.requirement_a === id ? d.b : d.a) as unknown as { id: string; title: string; source_name: string };
              return (
                <div key={d.id} className="flex flex-col gap-2 rounded-md bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <Link href={`/requirements/${other.id}`} className="font-medium text-brand-700 hover:underline">{other.title}</Link>
                    <span className="text-slate-600"> · {other.source_name} · {Math.round(Number(d.score) * 100)}% · {(d.reasons as string[]).join(', ')}</span>
                  </div>
                  {writable && (
                    <div className="flex gap-2">
                      <form action={resolveDuplicateAction}>
                        <input type="hidden" name="candidate_id" value={d.id} />
                        <input type="hidden" name="decision" value="merged" />
                        <input type="hidden" name="return_to" value={id} />
                        <Button size="sm" type="submit">Mark as duplicate</Button>
                      </form>
                      <form action={resolveDuplicateAction}>
                        <input type="hidden" name="candidate_id" value={d.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <input type="hidden" name="return_to" value={id} />
                        <Button size="sm" variant="secondary" type="submit">Not a duplicate</Button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-slate-100">
                <Row k="Required skills" v={r.skills.length ? <div className="flex flex-wrap gap-1">{r.skills.map((s: string) => <Badge key={s} tone="blue">{s}</Badge>)}</div> : null} />
                <Row k="Preferred skills" v={list(r.preferred_skills)} />
                <Row k="Experience" v={r.years_experience_min != null || r.years_experience_max != null ? `${r.years_experience_min ?? '?'}${r.years_experience_max != null ? `–${r.years_experience_max}` : '+'} years` : null} />
                <Row k="Location" v={[r.location_city, r.location_state].filter(Boolean).join(', ') || null} />
                <Row k="Work arrangement" v={r.work_arrangement ? label(r.work_arrangement) : null} />
                <Row k="Employment type" v={r.employment_type ? label(r.employment_type) : null} />
                <Row k="Rate / salary" v={rate} />
                <Row k="C2C / W2 / 1099" v={list(r.tax_terms)} />
                <Row k="Visa requirements" v={list(r.visa_requirements)} />
                <Row k="Date posted" v={r.date_posted ? formatDate(r.date_posted) : null} />
                <Row k="Closing date" v={r.closing_date ? formatDate(r.closing_date) : null} />
                <Row k="Source job ID" v={r.source_job_id} />
                <Row k="Vendor" v={company(r.vendor)} />
                <Row k="Prime vendor" v={company(r.prime)} />
                <Row k="Implementation partner" v={company(r.partner)} />
                <Row k="End client" v={company(r.client)} />
                <Row k="Recruiter" v={[r.recruiter_name, r.recruiter_email, r.recruiter_phone].filter(Boolean).join(' · ') || null} />
                <Row k="Submission instructions" v={r.submission_instructions} />
                <Row k="Extraction confidence" v={r.extraction_confidence != null ? `${Math.round(r.extraction_confidence * 100)}% (AI)` : null} />
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Original description" />
            <CardBody>
              {r.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{r.description}</p> : <p className="text-sm text-slate-400">No description.</p>}
            </CardBody>
          </Card>
          {r.ai_summary && (
            <Card>
              <CardHeader title="AI summary" description="Generated; verify against the original description." />
              <CardBody><p className="text-sm text-slate-800">{r.ai_summary}</p></CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {writable && (
            <Card>
              <CardHeader title="Status" />
              <CardBody className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <form key={s} action={setStatusAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="status" value={s} />
                    <Button size="sm" variant={r.status === s ? 'primary' : 'secondary'} type="submit" aria-pressed={r.status === s}>
                      {s === 'active' ? 'Active (verify)' : label(s)}
                    </Button>
                  </form>
                ))}
                {r.last_verified_at && <p className="w-full text-xs text-slate-500">Last verified {formatDateTime(r.last_verified_at)}</p>}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Follow-up and notes" />
            <CardBody>
              <form action={saveNotesAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <label className="block text-sm font-medium text-slate-700" htmlFor="follow_up_status">Follow-up</label>
                <Select id="follow_up_status" name="follow_up_status" defaultValue={r.follow_up_status} disabled={!writable}>
                  {['none', 'to_review', 'submitted', 'interviewing', 'on_hold', 'done'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                </Select>
                <label className="block text-sm font-medium text-slate-700" htmlFor="internal_notes">Internal notes</label>
                <Textarea id="internal_notes" name="internal_notes" defaultValue={r.internal_notes ?? ''} disabled={!writable} />
                {writable && <Button size="sm" type="submit">Save</Button>}
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Sources (${sources.data?.length ?? 0})`} />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {(sources.data ?? []).map((s) => (
                  <li key={s.id}>
                    <div className="font-medium text-slate-800">{s.source_name} <span className="font-normal text-slate-500">({label(s.source_category)})</span></div>
                    <div className="text-xs text-slate-500">
                      {formatDateTime(s.seen_at)}
                      {s.sender ? ` · ${s.sender}` : ''}
                    </div>
                    {s.url && <a className="text-xs text-brand-700 hover:underline" href={s.url} target="_blank" rel="noopener noreferrer nofollow">Open source link</a>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          {ADMIN_ROLES.includes(ctx.role) && (
            <Card>
              <CardHeader title="Audit trail" />
              <CardBody>
                <ul className="space-y-2 text-xs text-slate-600">
                  {(audit.data ?? []).map((a) => (
                    <li key={a.id}>
                      <span className="font-medium capitalize text-slate-800">{a.action}</span> · {formatDateTime(a.created_at)}
                      {a.action === 'update' && a.diff && <span> · {Object.keys(a.diff).join(', ')}</span>}
                    </li>
                  ))}
                </ul>
                <form action={deleteRequirementAction} className="mt-4 border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={id} />
                  <Button size="sm" variant="danger" type="submit">Delete requirement</Button>
                </form>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
