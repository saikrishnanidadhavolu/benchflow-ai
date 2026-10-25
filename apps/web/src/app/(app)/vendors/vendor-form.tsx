'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { label } from '@/lib/utils';
import type { VendorFormState } from './actions';

const CATEGORIES = ['staffing', 'prime_vendor', 'implementation_partner', 'end_client', 'consulting', 'other'];

export function VendorForm({ action, defaults = {}, cancelHref }: {
  action: (prev: VendorFormState, fd: FormData) => Promise<VendorFormState>;
  defaults?: Record<string, string>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  const text = (name: string, lbl: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={lbl} htmlFor={name} error={e[name]} hint={hint}>
      <Input id={name} name={name} defaultValue={defaults[name] ?? ''} aria-invalid={!!e[name]} {...props} />
    </Field>
  );
  return (
    <form action={formAction} noValidate>
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2" role="alert">{state.error}</p>}
          {text('name', 'Company name *', { required: true })}
          <Field label="Category" htmlFor="category" error={e.category}>
            <Select id="category" name="category" defaultValue={defaults.category ?? 'staffing'}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </Select>
          </Field>
          {text('website', 'Official website', { type: 'url', placeholder: 'https://' })}
          {text('vendor_portal_url', 'Vendor portal URL', { type: 'url', placeholder: 'https://' })}
          {text('supplier_registration_url', 'Supplier registration URL', { type: 'url', placeholder: 'https://' })}
          {text('careers_url', 'Careers / job search URL', { type: 'url', placeholder: 'https://' })}
          {text('contact_email', 'Public contact email', { type: 'email' })}
          {text('contact_phone', 'Public contact phone', { type: 'tel' })}
          {text('specializations', 'Technology specializations', {}, 'Comma separated')}
          {text('coverage', 'Geographic coverage', {}, 'Comma separated, e.g. TX, NJ, Nationwide')}
          {text('relationship_type', 'Your relationship', { placeholder: 'e.g. Active vendor, Registered supplier' })}
          <Field label="Verification" htmlFor="verification_status">
            <Select id="verification_status" name="verification_status" defaultValue={defaults.verification_status ?? 'unverified'}>
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
              <option value="needs_review">Needs review</option>
            </Select>
          </Field>
          {text('info_source', 'Source of this information', {}, 'Where the URLs and details were confirmed')}
          <Field label="Notes" htmlFor="notes" className="md:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ''} />
          </Field>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save vendor'}</Button>
            <Link href={cancelHref} className="inline-flex h-10 items-center rounded-md px-4 text-sm text-slate-700 hover:bg-slate-100">Cancel</Link>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
