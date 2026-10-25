'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export async function createOrganization(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(120).safeParse(formData.get('name'));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_organization', { p_name: name.data });
  if (error) return { error: 'Could not create the organization. Try again.' };
  redirect('/dashboard');
}
