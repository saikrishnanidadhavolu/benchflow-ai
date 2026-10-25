import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/lib/auth-roles';

export type MembershipState =
  | { kind: 'none' }
  | { kind: 'member'; orgId: string; orgName: string; isDemoOrg: boolean; role: Role }
  // A membership row exists but its organization cannot be read (deleted, or a policy problem).
  | { kind: 'inconsistent' };

/** Single source of truth for "does this user belong to an organization?", used by every route. */
export async function getMembership(supabase: SupabaseClient, userId: string): Promise<MembershipState> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, organization:organizations(id, name, is_demo)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(`Could not load organization membership: ${error.message}`);
  const row = data?.[0];
  if (!row) return { kind: 'none' };
  const org = row.organization as unknown as { id: string; name: string; is_demo: boolean } | null;
  if (!org) return { kind: 'inconsistent' };
  return { kind: 'member', orgId: org.id, orgName: org.name, isDemoOrg: org.is_demo, role: row.role as Role };
}

/**
 * Where to send a signed-in user, given their membership and the area they asked for.
 * App pages only redirect when the user is not a full member; onboarding only redirects full members.
 * Because both sides read the same state, they can never bounce a user back and forth.
 */
export function membershipRedirect(state: MembershipState, area: 'app' | 'onboarding'): string | null {
  if (area === 'app') {
    if (state.kind === 'member') return null;
    return state.kind === 'none' ? '/onboarding' : '/onboarding?issue=membership';
  }
  return state.kind === 'member' ? '/dashboard' : null;
}
