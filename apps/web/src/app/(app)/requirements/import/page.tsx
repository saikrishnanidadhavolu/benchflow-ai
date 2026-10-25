import { PageHeader } from '@/components/page-header';
import { requireRole, WRITE_ROLES } from '@/lib/auth';
import { CsvImporter } from './csv-importer';

export const metadata = { title: 'Import CSV' };

export default async function ImportPage() {
  await requireRole(WRITE_ROLES);
  return (
    <>
      <PageHeader title="Import requirements from CSV" description="Upload, map columns, review validation, then import. Rows with the same job ID or URL as an existing requirement are linked, not duplicated." />
      <CsvImporter />
    </>
  );
}
