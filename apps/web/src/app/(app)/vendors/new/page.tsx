import { PageHeader } from '@/components/page-header';
import { requireRole, WRITE_ROLES } from '@/lib/auth';
import { saveVendorAction } from '../actions';
import { VendorForm } from '../vendor-form';

export const metadata = { title: 'Add vendor' };

export default async function NewVendorPage() {
  await requireRole(WRITE_ROLES);
  return (
    <>
      <PageHeader title="Add vendor" description="Only enter official URLs you have confirmed. Do not guess portal links." />
      <VendorForm action={saveVendorAction.bind(null, null)} cancelHref="/vendors" />
    </>
  );
}
