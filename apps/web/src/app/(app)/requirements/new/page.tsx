import { PageHeader } from '@/components/page-header';
import { requireRole, WRITE_ROLES } from '@/lib/auth';
import { createRequirementAction } from '../actions';
import { RequirementForm } from '../requirement-form';

export const metadata = { title: 'Add requirement' };

export default async function NewRequirementPage() {
  await requireRole(WRITE_ROLES);
  return (
    <>
      <PageHeader title="Add requirement" description="Manually enter a job requirement. Exact duplicates are detected by job ID and URL." />
      <RequirementForm action={createRequirementAction} submitLabel="Save requirement" cancelHref="/requirements" />
    </>
  );
}
