'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const base = item.href.split('?')[0]!;
        const match = 'match' in item ? item.match : undefined;
        const active = match
          ? pathname === base && search.includes(match)
          : pathname === base
            ? !(base === '/vendors' && search.includes('category='))
            : pathname.startsWith(`${base}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-white/15 font-medium text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  const brand = (
    <div className="mb-6 px-3">
      <div className="text-lg font-semibold tracking-tight text-white">BenchFlow AI</div>
      <div className="truncate text-xs text-brand-100">{orgName}</div>
    </div>
  );
  return (
    <>
      <aside className="hidden w-64 shrink-0 bg-brand-900 px-3 py-5 lg:block">
        <div className="sticky top-5">
          {brand}
          <NavLinks />
        </div>
      </aside>
      <div className="flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <span className="font-semibold text-white">BenchFlow AI</span>
        <button type="button" className="rounded p-1 text-white" aria-label="Open navigation" onClick={() => setOpen(true)}>
          <Menu className="h-6 w-6" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-brand-900 px-3 py-5">
            <button type="button" className="absolute right-3 top-4 rounded p-1 text-white" aria-label="Close navigation" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            {brand}
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
