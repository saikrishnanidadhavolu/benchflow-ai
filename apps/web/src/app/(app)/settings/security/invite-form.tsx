'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { createInvitationAction } from './actions';

export function InviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [state, action, pending] = useActionState(createInvitationAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="invite-role">Role</label>
        <Select id="invite-role" name="role" defaultValue="recruiter" className="sm:w-40">
          <option value="recruiter">Recruiter</option>
          <option value="viewer">Viewer</option>
          {canInviteAdmin && <option value="admin">Admin</option>}
        </Select>
        <label className="sr-only" htmlFor="invite-days">Valid for</label>
        <Select id="invite-days" name="valid_days" defaultValue="7" className="sm:w-40">
          <option value="1">Valid 1 day</option>
          <option value="7">Valid 7 days</option>
          <option value="30">Valid 30 days</option>
        </Select>
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create invitation code'}</Button>
      </div>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      {state.code && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm">
          <p className="text-emerald-800">Share this single-use code. It is shown only once.</p>
          <code data-testid="invite-code" className="mt-1 block select-all font-mono text-base text-slate-900">{state.code}</code>
        </div>
      )}
    </form>
  );
}
