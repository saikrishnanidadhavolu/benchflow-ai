'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { createOrganization } from './actions';

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganization, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Organization name" htmlFor="name" error={state.error}>
        <Input id="name" name="name" placeholder="e.g. Acme IT Staffing" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating…' : 'Continue'}
      </Button>
    </form>
  );
}
