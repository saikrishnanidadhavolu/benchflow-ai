import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMembership, membershipRedirect } from '@/lib/membership';
import { CreateOrganizationForm, JoinOrganizationForm } from './onboarding-form';

export const metadata = { title: 'Set up your organization' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ issue?: string }> }) {
  const { issue } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fonboarding');
  const membership = await getMembership(supabase, user.id);
  const target = membershipRedirect(membership, 'onboarding');
  if (target) redirect(target);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to BenchFlow AI</h1>
          <p className="mt-1 text-sm text-slate-600">Signed in as {user.email}. Requirements, vendors and mailboxes belong to an organization. Create one or join your team&apos;s.</p>
        </div>
        {(membership.kind === 'inconsistent' || issue === 'membership') && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            Your account is linked to an organization that could not be loaded. Ask an owner of that organization to check your membership, or contact support. You can also sign out below.
          </p>
        )}
        {membership.kind === 'none' && (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold">Create an organization</h2>
              <p className="mb-4 mt-1 text-sm text-slate-600">You will be its owner and can invite teammates.</p>
              <CreateOrganizationForm />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold">Join with an invitation code</h2>
              <p className="mb-4 mt-1 text-sm text-slate-600">Ask an owner or admin for a code from User and Security Settings.</p>
              <JoinOrganizationForm />
            </section>
          </>
        )}
        <form action="/auth/signout" method="post" className="text-center">
          <button type="submit" className="text-sm text-slate-600 hover:underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
