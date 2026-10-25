import { describe, expect, it } from 'vitest';
import { membershipRedirect, type MembershipState } from '../membership';

const member: MembershipState = { kind: 'member', orgId: 'o', orgName: 'Org', isDemoOrg: false, role: 'owner' };
const none: MembershipState = { kind: 'none' };
const inconsistent: MembershipState = { kind: 'inconsistent' };

describe('membershipRedirect', () => {
  it('sends users without an organization from app pages to onboarding, and lets onboarding render', () => {
    expect(membershipRedirect(none, 'app')).toBe('/onboarding');
    expect(membershipRedirect(none, 'onboarding')).toBeNull();
  });

  it('lets members into the app and sends them away from onboarding', () => {
    expect(membershipRedirect(member, 'app')).toBeNull();
    expect(membershipRedirect(member, 'onboarding')).toBe('/dashboard');
  });

  it('never loops for an unreadable membership: app → onboarding with an issue flag, onboarding stays put', () => {
    expect(membershipRedirect(inconsistent, 'app')).toBe('/onboarding?issue=membership');
    expect(membershipRedirect(inconsistent, 'onboarding')).toBeNull();
  });

  it('has no state where both areas redirect into each other', () => {
    for (const s of [member, none, inconsistent]) {
      const fromApp = membershipRedirect(s, 'app');
      const fromOnboarding = membershipRedirect(s, 'onboarding');
      expect(fromApp?.startsWith('/onboarding') && fromOnboarding?.startsWith('/dashboard')).toBeFalsy();
    }
  });
});
