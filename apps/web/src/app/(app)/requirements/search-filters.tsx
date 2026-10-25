'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { EMPLOYMENT_TYPES, REQUIREMENT_STATUSES, SOURCE_CATEGORIES, TAX_TERMS, WORK_ARRANGEMENTS, toQueryString, type SearchParams } from '@benchflow/core/search/filters';
import { ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { label } from '@/lib/utils';

function MultiCheck<T extends string>({ title, options, value, onChange }: { title: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" className="rounded border-slate-300" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SearchFilters({ params, vendors, sourceNames }: { params: SearchParams; vendors: { id: string; name: string }[]; sourceNames: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [s, setS] = useState(params);
  const activeFilters = [s.source, s.sourceName, s.state, s.skill, s.arrangement, s.type, s.tax, s.status].reduce((n, a) => n + a.length, 0) + (s.vendor ? 1 : 0) + (s.from ? 1 : 0) + (s.to ? 1 : 0) + (s.within ? 1 : 0);
  const [open, setOpen] = useState(activeFilters > 0);

  const apply = (next: SearchParams) => startTransition(() => router.push(`/requirements?${toQueryString({ ...next, page: 1 })}`));
  const set = <K extends keyof SearchParams>(k: K, v: SearchParams[K]) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        apply(s);
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="q" className="sr-only">Search query</label>
          <Input id="q" value={s.q} onChange={(e) => set('q', e.target.value)} className="pl-9" placeholder='Java AND AWS AND C2C · "data engineer" AND snowflake AND Texas · react -angular' />
        </div>
        <Select aria-label="Sort" value={s.sort} onChange={(e) => set('sort', e.target.value as SearchParams['sort'])} className="sm:w-40">
          <option value="newest">Newest first</option>
          <option value="relevance">Best match</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
        </Select>
        <Button type="submit" disabled={pending}>{pending ? 'Searching…' : 'Search'}</Button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Operators: AND, OR, NOT/-, (), &quot;phrases&quot;, prefix*. Fields: title: skill: state: vendor: prime: partner: client: source: sender: recruiter: jobid: status:
        </p>
        <button type="button" onClick={() => setOpen(!open)} className="flex shrink-0 items-center gap-1 text-sm text-brand-600" aria-expanded={open}>
          Filters{activeFilters ? ` (${activeFilters})` : ''} <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-3">
          <MultiCheck title="Source type" options={SOURCE_CATEGORIES} value={s.source} onChange={(v) => set('source', v)} />
          <MultiCheck title="Work arrangement" options={WORK_ARRANGEMENTS} value={s.arrangement} onChange={(v) => set('arrangement', v)} />
          <MultiCheck title="Employment type" options={EMPLOYMENT_TYPES} value={s.type} onChange={(v) => set('type', v)} />
          <MultiCheck title="Tax terms" options={TAX_TERMS} value={s.tax} onChange={(v) => set('tax', v)} />
          <MultiCheck title="Status (default hides duplicates)" options={REQUIREMENT_STATUSES} value={s.status} onChange={(v) => set('status', v)} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              From
              <Input type="date" value={s.from ?? ''} onChange={(e) => set('from', e.target.value || undefined)} className="mt-1" />
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              To
              <Input type="date" value={s.to ?? ''} onChange={(e) => set('to', e.target.value || undefined)} className="mt-1" />
            </label>
          </div>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Received within
            <Select value={s.within ?? ''} onChange={(e) => set('within', e.target.value ? Number(e.target.value) : undefined)} className="mt-1">
              <option value="">Any time</option>
              <option value="24">Last 24 hours</option>
              <option value="72">Last 3 days</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
            </Select>
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Source
            <Select value={s.sourceName[0] ?? ''} onChange={(e) => set('sourceName', e.target.value ? [e.target.value] : [])} className="mt-1">
              <option value="">All sources</option>
              {sourceNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Vendor / partner / client
            <Select value={s.vendor ?? ''} onChange={(e) => set('vendor', e.target.value || undefined)} className="mt-1">
              <option value="">Any company</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            States (comma separated)
            <Input value={s.state.join(',')} onChange={(e) => set('state', e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))} placeholder="TX, NJ" className="mt-1" />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Required skills (all of)
            <Input value={s.skill.join(',')} onChange={(e) => set('skill', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Java, AWS" className="mt-1" />
          </label>
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
            <Button type="submit" disabled={pending}>Apply filters</Button>
            <Button type="button" variant="ghost" onClick={() => { const cleared = { ...params, q: s.q, source: [], sourceName: [], state: [], skill: [], arrangement: [], type: [], tax: [], status: [], vendor: undefined, from: undefined, to: undefined, within: undefined }; setS(cleared); apply(cleared); }}>
              Clear filters
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
