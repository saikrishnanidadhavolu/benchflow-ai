import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership, membershipRedirect } from '@/lib/membership';
import type { Role } from '@/lib/auth-roles';

export { ADMIN_ROLES, WRITE_ROLES, canWrite, type Role } from '@/lib/auth-roles';

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

  const membership = await getMembership(supabase, user.id);
  const target = membershipRedirect(membership, 'app');
  if (target || membership.kind !== 'member') redirect(target ?? '/onboarding');

  const { data: profile } = await supabase.from('users').select('display_name').eq('id', user.id).maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name ?? user.email ?? 'User',
    orgId: membership.orgId,
    orgName: membership.orgName,
    isDemoOrg: membership.isDemoOrg,
    role: membership.role,
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
