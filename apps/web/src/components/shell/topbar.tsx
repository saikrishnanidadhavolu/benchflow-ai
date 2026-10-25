import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AppContext } from '@/lib/auth';

export function Topbar({ ctx }: { ctx: AppContext }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <form action="/requirements" role="search" className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="global-search" className="sr-only">
            Search requirements
          </label>
          <input
            id="global-search"
            name="q"
            placeholder='Search: Java AND AWS AND C2C, "data engineer" state:TX, vendor:acme…'
            className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </form>
        <div className="hidden items-center gap-3 sm:flex">
          {ctx.isDemoOrg && <Badge tone="amber">Synthetic demo data</Badge>}
          <div className="text-right">
            <div className="text-sm font-medium leading-tight">{ctx.displayName}</div>
            <div className="text-xs capitalize text-slate-500">{ctx.role}</div>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
