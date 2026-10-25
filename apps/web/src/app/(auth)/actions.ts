'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

export interface AuthState {
  error?: string;
  message?: string;
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

function safeNext(next: FormDataEntryValue | null): string {
  const v = typeof next === 'string' ? next : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : '/dashboard';
}

async function clientKey(prefix: string, email: string) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  return `${prefix}:${ip}:${email}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!rateLimit(await clientKey('signin', parsed.data.email), 10, 15 * 60_000))
    return { error: 'Too many attempts. Try again in a few minutes.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Invalid email or password.' };
  redirect(safeNext(formData.get('next')));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({ display_name: z.string().trim().min(1, 'Enter your name').max(100) })
    .safeParse({ email: formData.get('email'), password: formData.get('password'), display_name: formData.get('display_name') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!rateLimit(await clientKey('signup', parsed.data.email), 5, 60 * 60_000))
    return { error: 'Too many sign-up attempts. Try again later.' };

  const origin = (await headers()).get('origin') ?? '';
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.display_name }, emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: 'Check your email to confirm your account, then sign in.' };
  redirect('/onboarding');
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get('email'));
  if (!email.success) return { error: 'Enter a valid email address' };
  if (!rateLimit(await clientKey('magic', email.data), 3, 15 * 60_000))
    return { error: 'Too many requests. Try again in a few minutes.' };
  const origin = (await headers()).get('origin') ?? '';
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(formData.get('next')))}` },
  });
  // Same response whether or not the account exists, to avoid account enumeration.
  if (error && error.status !== 400 && error.status !== 422) return { error: 'Could not send the link. Try again.' };
  return { message: 'If an account exists for that email, a sign-in link is on its way.' };
}
