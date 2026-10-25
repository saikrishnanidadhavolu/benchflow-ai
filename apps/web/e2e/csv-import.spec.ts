import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('CSV import validates rows, imports valid ones and reports errors', async ({ page }) => {
  await login(page);
  const id = Date.now();
  const csv = [
    'Job Title,Skills,City,State,Rate,Rate Unit,Job ID,Vendor',
    `CSV Kafka Engineer,"Kafka, Java",Austin,TX,70,hour,CSV-${id}-1,E2E Vendor ${id}`,
    `,Python,Austin,TX,,,CSV-${id}-2,`,
  ].join('\n');
  await page.goto('/requirements/import');
  await page.getByLabel('CSV file').setInputFiles({ name: `e2e-${id}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('1 of 2 rows are valid')).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 rows' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  await expect(page.getByText(/Row 3: .*title/i)).toBeVisible();
  await page.goto(`/requirements?q=jobid:CSV-${id}-1`);
  await expect(page.getByText('1 requirement', { exact: true })).toBeVisible();
});
