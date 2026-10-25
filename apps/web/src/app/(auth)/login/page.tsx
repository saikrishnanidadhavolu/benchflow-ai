import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-slate-600">Welcome back. Sign in to your workspace.</p>
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">That sign-in link is invalid or has expired.</p>}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-sm text-slate-600">
        New to BenchFlow?{' '}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
