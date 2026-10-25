'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import type { FormState } from './actions';

export type RequirementDefaults = Partial<Record<string, string>>;

export function RequirementForm({
  action,
  defaults = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: RequirementDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  const text = (name: string, lbl: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={lbl} htmlFor={name} error={e[name]} hint={hint}>
      <Input id={name} name={name} defaultValue={defaults[name] ?? ''} aria-invalid={!!e[name]} {...props} />
    </Field>
  );
  const select = (name: string, lbl: string, options: [string, string][]) => (
    <Field label={lbl} htmlFor={name} error={e[name]}>
      <Select id={name} name={name} defaultValue={defaults[name] ?? ''}>
        <option value="">Not stated</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p>
      )}
      <Card>
        <CardHeader title="Job" description="Leave anything that is not stated in the source blank. Unknown values are stored as empty, never guessed." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          {text('title', 'Job title *', { required: true, maxLength: 300 })}
          {text('source_job_id', 'Job ID from source')}
          <Field label="Job description" htmlFor="description" error={e.description} className="md:col-span-2">
            <Textarea id="description" name="description" rows={8} defaultValue={defaults.description ?? ''} />
          </Field>
          {text('skills', 'Required skills', {}, 'Comma separated, e.g. Java, Spring Boot, AWS')}
          {text('preferred_skills', 'Preferred skills', {}, 'Comma separated')}
          {text('years_experience_min', 'Min years of experience', { inputMode: 'decimal' })}
          {text('years_experience_max', 'Max years of experience', { inputMode: 'decimal' })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Location and terms" />
        <CardBody className="grid gap-4 md:grid-cols-3">
          {text('location_city', 'City')}
          {text('location_state', 'State', {}, '2-letter code or full name')}
          {select('work_arrangement', 'Work arrangement', [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'Onsite']])}
          {select('employment_type', 'Employment type', [['contract', 'Contract'], ['contract_to_hire', 'Contract-to-hire'], ['full_time', 'Full-time'], ['part_time', 'Part-time']])}
          {text('rate_min', 'Rate / salary (min)', { inputMode: 'decimal' })}
          {text('rate_max', 'Rate / salary (max)', { inputMode: 'decimal' })}
          {select('rate_unit', 'Rate unit', [['hour', 'Per hour'], ['day', 'Per day'], ['month', 'Per month'], ['year', 'Per year']])}
          {text('currency', 'Currency', { maxLength: 3, placeholder: 'USD' })}
          {text('tax_terms', 'C2C / W2 / 1099', {}, 'Only if stated. Comma separated.')}
          {text('visa_requirements', 'Visa requirements', {}, 'Only if stated, e.g. H1B, GC, USC')}
          {text('date_posted', 'Date posted', { type: 'date' })}
          {text('closing_date', 'Closing date', { type: 'date' })}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Companies and contacts" description="Only record a prime vendor, partner or client relationship if the source states it." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          {text('vendor_name', 'Vendor / recruiting company')}
          {text('prime_vendor_name', 'Prime vendor')}
          {text('implementation_partner_name', 'Implementation partner')}
          {text('end_client_name', 'End client')}
          {text('recruiter_name', 'Recruiter name')}
          {text('recruiter_email', 'Recruiter email', { type: 'email' })}
          {text('recruiter_phone', 'Recruiter phone', { type: 'tel' })}
          {text('original_url', 'Original job URL', { type: 'url', placeholder: 'https://' })}
          <Field label="Submission instructions" htmlFor="submission_instructions" error={e.submission_instructions} className="md:col-span-2">
            <Textarea id="submission_instructions" name="submission_instructions" rows={3} defaultValue={defaults.submission_instructions ?? ''} />
          </Field>
          <Field label="Internal notes" htmlFor="internal_notes" error={e.internal_notes} className="md:col-span-2">
            <Textarea id="internal_notes" name="internal_notes" rows={3} defaultValue={defaults.internal_notes ?? ''} />
          </Field>
        </CardBody>
      </Card>
      <input type="hidden" name="status" value={defaults.status ?? 'active'} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
        <Link href={cancelHref} className="inline-flex h-10 items-center rounded-md px-4 text-sm text-slate-700 hover:bg-slate-100">Cancel</Link>
      </div>
    </form>
  );
}
