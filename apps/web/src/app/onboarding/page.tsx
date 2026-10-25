import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

export const metadata = { title: 'Set up your organization' };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { count } = await supabase.from('user_roles').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if (count) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Set up your organization</h1>
        <p className="mb-6 mt-1 text-sm text-slate-600">
          Requirements, vendors and mailboxes are scoped to an organization. You will be its owner.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
