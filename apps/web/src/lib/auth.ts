import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'owner' | 'admin' | 'recruiter' | 'viewer';
export const WRITE_ROLES: Role[] = ['owner', 'admin', 'recruiter'];
export const ADMIN_ROLES: Role[] = ['owner', 'admin'];

export interface AppContext {
  userId: string;
  email: string;
  displayName: string;
  orgId: string;
  orgName: string;
  isDemoOrg: boolean;
  role: Role;
}

/** Loads the signed-in user and their organization membership; redirects when missing. */
export const requireContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('user_roles')
    .select('role, organization:organizations(id, name, is_demo)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const org = membership?.organization as unknown as { id: string; name: string; is_demo: boolean } | null;
  if (!membership || !org) redirect('/onboarding');

  const { data: profile } = await supabase.from('users').select('display_name').eq('id', user.id).maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name ?? user.email ?? 'User',
    orgId: org.id,
    orgName: org.name,
    isDemoOrg: org.is_demo,
    role: membership.role as Role,
  };
});

export class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
  }
}

/** Server-side role gate for mutations (RLS enforces the same rules in the database). */
export async function requireRole(roles: Role[]): Promise<AppContext> {
  const ctx = await requireContext();
  if (!roles.includes(ctx.role)) throw new AuthorizationError();
  return ctx;
}

export const canWrite = (role: Role) => WRITE_ROLES.includes(role);
