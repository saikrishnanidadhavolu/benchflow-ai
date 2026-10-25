import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireRole, WRITE_ROLES } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { updateRequirementAction } from '../../actions';
import { RequirementForm, type RequirementDefaults } from '../../requirement-form';

export const metadata = { title: 'Edit requirement' };

export default async function EditRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole(WRITE_ROLES);
  const supabase = await createClient();
  const { data: r } = await supabase
    .from('job_requirements')
    .select('*, vendor:vendors!job_requirements_vendor_id_fkey(name), prime:vendors!job_requirements_prime_vendor_id_fkey(name), partner:vendors!job_requirements_implementation_partner_id_fkey(name), client:vendors!job_requirements_end_client_id_fkey(name)')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!r) notFound();
  const str = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
  const defaults: RequirementDefaults = {
    ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)])),
    vendor_name: r.vendor?.name ?? '',
    prime_vendor_name: r.prime?.name ?? '',
    implementation_partner_name: r.partner?.name ?? '',
    end_client_name: r.client?.name ?? '',
  };
  return (
    <>
      <PageHeader title="Edit requirement" description={r.title} />
      <RequirementForm action={updateRequirementAction.bind(null, id)} defaults={defaults} submitLabel="Save changes" cancelHref={`/requirements/${id}`} />
    </>
  );
}
