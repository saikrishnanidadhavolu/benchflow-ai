import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { canWrite, requireContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { label } from '@/lib/utils';
import { VENDOR_CATEGORIES } from './constants';

export const metadata = { title: 'Vendor Directory' };
export const dynamic = 'force-dynamic';

const TITLES: Record<string, string> = { prime_vendor: 'Prime Vendors', implementation_partner: 'Implementation Partners' };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const ctx = await requireContext();
  const { q = '', category = '' } = await searchParams;
  const cat = (VENDOR_CATEGORIES as readonly string[]).includes(category) ? category : '';
  const supabase = await createClient();
  let query = supabase
    .from('vendors')
    .select('id, name, category, website, vendor_portal_url, specializations, coverage, verification_status')
    .eq('organization_id', ctx.orgId)
    .order('name')
    .limit(500);
  if (cat) query = query.eq('category', cat);
  const term = q.trim().slice(0, 100);
  if (term) query = query.ilike('name', `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data: vendors } = await query;

  return (
    <>
      <PageHeader
        title={TITLES[cat] ?? 'Vendor Directory'}
        description="Staffing vendors, prime vendors, implementation partners and disclosed end clients. Relationships are only recorded when stated or verified."
        actions={
          <>
            {canWrite(ctx.role) && <Link href="/vendors/new" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add vendor</Link>}
            <a href={`/api/vendors/export${cat ? `?category=${cat}` : ''}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Export CSV</a>
          </>
        }
      />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/vendors">
        <label htmlFor="vq" className="sr-only">Search vendors</label>
        <Input id="vq" name="q" defaultValue={term} placeholder="Search by company name" className="sm:max-w-sm" />
        <Select name="category" defaultValue={cat} aria-label="Category" className="sm:w-56">
          <option value="">All categories</option>
          {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Card className="overflow-x-auto">
        {!vendors?.length ? (
          <p className="p-10 text-center text-sm text-slate-500">No vendors found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Company</th><th className="px-4">Category</th><th className="px-4">Specializations</th><th className="px-4">Coverage</th><th className="px-4">Verification</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/vendors/${v.id}`} className="font-medium text-slate-900 hover:text-brand-700">{v.name}</Link>
                    {v.website && <div className="truncate text-xs text-slate-500">{v.website}</div>}
                  </td>
                  <td className="px-4">{label(v.category)}</td>
                  <td className="px-4 text-slate-600">{v.specializations.join(', ') || '—'}</td>
                  <td className="px-4 text-slate-600">{v.coverage.join(', ') || '—'}</td>
                  <td className="px-4"><Badge tone={v.verification_status === 'verified' ? 'green' : v.verification_status === 'needs_review' ? 'amber' : 'slate'}>{label(v.verification_status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
