export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="text-2xl font-semibold tracking-tight">BenchFlow AI</div>
          <p className="mt-1 text-sm text-brand-100">Job requirements and vendor intelligence for bench sales</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-xl sm:p-8">{children}</div>
      </div>
    </main>
  );
}
