'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireRole, ADMIN_ROLES, WRITE_ROLES } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { VENDOR_CATEGORIES } from './constants';


const optUrl = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.string().url().refine((v) => /^https?:\/\//i.test(v), 'Must start with http:// or https://').nullable());
const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const list = z.string().transform((v) => [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 50));

const vendorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  category: z.enum(VENDOR_CATEGORIES),
  website: optUrl,
  vendor_portal_url: optUrl,
  supplier_registration_url: optUrl,
  careers_url: optUrl,
  contact_email: z.string().trim().transform((v) => v || null).pipe(z.string().email().nullable()),
  contact_phone: optText(50),
  specializations: list,
  coverage: list,
  relationship_type: optText(100),
  verification_status: z.enum(['unverified', 'verified', 'needs_review']),
  info_source: optText(500),
  notes: optText(5000),
});

export interface VendorFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parse(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const k of Object.keys(vendorSchema.shape)) raw[k] = String(formData.get(k) ?? '');
  const r = vendorSchema.safeParse(raw);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: { error: 'Please fix the highlighted fields.', fieldErrors } as VendorFormState };
  }
  const { contact_email, contact_phone, ...rest } = r.data;
  const row = {
    ...rest,
    contact: { email: contact_email, phone: contact_phone },
    last_verified_at: rest.verification_status === 'verified' ? new Date().toISOString() : null,
  };
  return { row };
}

export async function saveVendorAction(id: string | null, _prev: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const ctx = await requireRole(WRITE_ROLES);
  const parsed = parse(formData);
  if (parsed.error) return parsed.error;
  const supabase = await createClient();
  let vendorId = id;
  if (id) {
    const { error } = await supabase.from('vendors').update(parsed.row).eq('id', id).eq('organization_id', ctx.orgId);
    if (error) return { error: error.code === '23505' ? 'A vendor with this name already exists.' : error.message };
  } else {
    const { data, error } = await supabase
      .from('vendors')
      .insert({ ...parsed.row, organization_id: ctx.orgId, created_by: ctx.userId })
      .select('id')
      .single();
    if (error) return { error: error.code === '23505' ? 'A vendor with this name already exists.' : error.message };
    vendorId = data.id;
  }
  revalidatePath('/vendors');
  redirect(`/vendors/${vendorId}`);
}

export async function deleteVendorAction(formData: FormData) {
  const ctx = await requireRole(ADMIN_ROLES);
  const id = z.string().uuid().parse(formData.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.from('vendors').delete().eq('id', id).eq('organization_id', ctx.orgId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
  redirect('/vendors');
}
