import { Suspense } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { requireContext } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense>
        <Sidebar orgName={ctx.orgName} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar ctx={ctx} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
