import { NextResponse, type NextRequest } from 'next/server';
import Papa from 'papaparse';
import { sanitizeCell } from '@benchflow/core/import/csv';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: role } = await supabase.from('user_roles').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let q = supabase
    .from('vendors')
    .select('name, category, website, vendor_portal_url, supplier_registration_url, careers_url, specializations, coverage, relationship_type, verification_status, last_verified_at, info_source, notes')
    .eq('organization_id', role.organization_id)
    .order('name');
  const category = request.nextUrl.searchParams.get('category');
  if (category && /^[a-z_]{1,40}$/.test(category)) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Export failed' }, { status: 500 });

  const rows = (data ?? []).map((v) =>
    Object.fromEntries(Object.entries(v).map(([k, val]) => [k, sanitizeCell(Array.isArray(val) ? val.join('; ') : val == null ? '' : String(val))])),
  );
  const csv = Papa.unparse(rows);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vendors-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
