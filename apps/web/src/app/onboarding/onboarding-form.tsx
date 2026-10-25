'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { createOrganization, joinOrganization } from './actions';

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Organization name" htmlFor="name" error={state.error}>
        <Input id="name" name="name" placeholder="e.g. Acme IT Staffing" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating…' : 'Create organization'}
      </Button>
    </form>
  );
}

export function JoinOrganizationForm() {
  const [state, action, pending] = useActionState(joinOrganization, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Invitation code" htmlFor="code" error={state.error}>
        <Input id="code" name="code" placeholder="BF-XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" required />
      </Field>
      <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
        {pending ? 'Joining…' : 'Join organization'}
      </Button>
    </form>
  );
}
