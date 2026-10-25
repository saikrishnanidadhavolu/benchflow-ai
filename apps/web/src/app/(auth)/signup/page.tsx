import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-slate-600">You will set up your organization next.</p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
