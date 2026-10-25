'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ADMIN_ROLES, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface InviteState {
  error?: string;
  code?: string;
}

export async function createInvitationAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const ctx = await requireRole(ADMIN_ROLES);
    const role = z.enum(['admin', 'recruiter', 'viewer']).parse(formData.get('role'));
    const days = z.coerce.number().int().min(1).max(30).parse(formData.get('valid_days') ?? 7);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('create_invitation', { p_org: ctx.orgId, p_role: role, p_valid_days: days, p_max_uses: 1 });
    if (error) return { error: error.code === '42501' ? error.message : 'Could not create the invitation.' };
    revalidatePath('/settings/security');
    return { code: data as string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the invitation.' };
  }
}

export async function revokeInvitationAction(formData: FormData) {
  const ctx = await requireRole(ADMIN_ROLES);
  const id = z.string().uuid().parse(formData.get('id'));
  const supabase = await createClient();
  const { error } = await supabase
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.orgId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings/security');
}
