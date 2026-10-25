'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { sendMagicLink, signIn, type AuthState } from '../actions';

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === 'password' ? signIn : sendMagicLink, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {mode === 'password' && (
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      )}
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Please wait…' : mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-brand-600 hover:underline"
        onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
      >
        {mode === 'password' ? 'Use a magic link instead' : 'Use password instead'}
      </button>
    </form>
  );
}
