'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

export interface OnboardingState {
  error?: string;
}

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fonboarding');
  return { supabase, userId: user.id };
}

export async function createOrganization(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(120).safeParse(formData.get('name'));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const { supabase, userId } = await currentUserId();
  if (!rateLimit(`create-org:${userId}`, 5, 60 * 60_000)) return { error: 'Too many attempts. Try again later.' };
  const { error } = await supabase.rpc('create_organization', { p_name: name.data });
  if (error) {
    if (error.hint === 'already_member') redirect('/dashboard');
    return { error: 'Could not create the organization. Try again.' };
  }
  redirect('/dashboard');
}

export async function joinOrganization(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const code = z
    .string()
    .trim()
    .min(8, 'Enter the full invitation code')
    .max(40)
    .regex(/^[A-Za-z0-9-\s]+$/, 'Codes contain only letters, numbers and dashes')
    .safeParse(formData.get('code'));
  if (!code.success) return { error: code.error.issues[0]?.message };
  const { supabase, userId } = await currentUserId();
  if (!rateLimit(`join-org:${userId}`, 10, 15 * 60_000)) return { error: 'Too many attempts. Try again in a few minutes.' };
  const { error } = await supabase.rpc('accept_invitation', { p_code: code.data });
  if (error) {
    if (error.hint === 'already_member') redirect('/dashboard');
    if (error.hint === 'invalid_invitation') return { error: 'That invitation code is invalid, expired or already used.' };
    return { error: 'Could not join the organization. Try again.' };
  }
  redirect('/dashboard');
}
