import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, STATUS_TONE } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ADMIN_ROLES, canWrite, requireContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, label } from '@/lib/utils';
import { deleteVendorAction, saveVendorAction } from '../actions';
import { VendorForm } from '../vendor-form';

export const dynamic = 'force-dynamic';

export default async function VendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: v } = await supabase.from('vendors').select('*').eq('id', id).eq('organization_id', ctx.orgId).maybeSingle();
  if (!v) notFound();

  if (edit && canWrite(ctx.role)) {
    const defaults: Record<string, string> = {
      ...Object.fromEntries(Object.entries(v).map(([k, val]) => [k, Array.isArray(val) ? val.join(', ') : val == null ? '' : String(val)])),
      contact_email: v.contact?.email ?? '',
      contact_phone: v.contact?.phone ?? '',
    };
    return (
      <>
        <PageHeader title={`Edit ${v.name}`} />
        <VendorForm action={saveVendorAction.bind(null, id)} defaults={defaults} cancelHref={`/vendors/${id}`} />
      </>
    );
  }

  const { data: reqs } = await supabase
    .from('job_requirements')
    .select('id, title, status, date_received')
    .eq('organization_id', ctx.orgId)
    .or(`vendor_id.eq.${id},prime_vendor_id.eq.${id},implementation_partner_id.eq.${id},end_client_id.eq.${id}`)
    .order('date_received', { ascending: false })
    .limit(50);

  const link = (url: string | null) => (url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-700 hover:underline">{url}</a> : <span className="text-slate-400">Not recorded</span>);

  return (
    <>
      <PageHeader
        title={v.name}
        description={`${label(v.category)} · ${label(v.verification_status)}${v.last_verified_at ? ` on ${formatDateTime(v.last_verified_at)}` : ''}`}
        actions={canWrite(ctx.role) ? <Link href={`/vendors/${id}?edit=1`} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Edit</Link> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Company details" />
          <CardBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Website</dt><dd>{link(v.website)}</dd></div>
              <div><dt className="text-slate-500">Vendor portal</dt><dd>{link(v.vendor_portal_url)}</dd></div>
              <div><dt className="text-slate-500">Supplier registration</dt><dd>{link(v.supplier_registration_url)}</dd></div>
              <div><dt className="text-slate-500">Careers</dt><dd>{link(v.careers_url)}</dd></div>
              <div><dt className="text-slate-500">Contact</dt><dd>{[v.contact?.email, v.contact?.phone].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt className="text-slate-500">Relationship</dt><dd>{v.relationship_type ?? '—'}</dd></div>
              <div><dt className="text-slate-500">Specializations</dt><dd>{v.specializations.join(', ') || '—'}</dd></div>
              <div><dt className="text-slate-500">Coverage</dt><dd>{v.coverage.join(', ') || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Source of information</dt><dd>{v.info_source ?? '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{v.notes ?? '—'}</dd></div>
            </dl>
            {ADMIN_ROLES.includes(ctx.role) && (
              <form action={deleteVendorAction} className="mt-6 border-t border-slate-100 pt-4">
                <input type="hidden" name="id" value={id} />
                <Button size="sm" variant="danger" type="submit">Delete vendor</Button>
              </form>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Linked requirements (${reqs?.length ?? 0})`} />
          <CardBody>
            {!reqs?.length ? <p className="text-sm text-slate-500">None.</p> : (
              <ul className="space-y-2">
                {reqs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/requirements/${r.id}`} className="truncate text-brand-700 hover:underline">{r.title}</Link>
                    <Badge tone={STATUS_TONE[r.status]}>{label(r.status)}</Badge>
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
