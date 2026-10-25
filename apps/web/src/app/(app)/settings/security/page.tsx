import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ADMIN_ROLES, requireContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils';

export const metadata = { title: 'User and Security Settings' };
export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const isAdmin = ADMIN_ROLES.includes(ctx.role);
  const [members, audit] = await Promise.all([
    supabase.from('user_roles').select('id, role, user:users(email, display_name)').eq('organization_id', ctx.orgId),
    isAdmin
      ? supabase.from('audit_logs').select('id, action, entity_type, entity_id, actor_user_id, created_at').eq('organization_id', ctx.orgId).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as { id: number; action: string; entity_type: string; entity_id: string | null; actor_user_id: string | null; created_at: string }[] }),
  ]);
  return (
    <>
      <PageHeader title="User and Security Settings" description={`${ctx.orgName} · signed in as ${ctx.email}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Members and roles" description="Owner and admin manage members. Viewers have read-only access and cannot see consultant data." />
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {(members.data ?? []).map((m) => {
                const u = m.user as unknown as { email: string; display_name: string | null } | null;
                return (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">{u?.display_name ?? u?.email}</div>
                      <div className="text-xs text-slate-500">{u?.email}</div>
                    </div>
                    <Badge tone={m.role === 'owner' ? 'purple' : m.role === 'viewer' ? 'slate' : 'blue'}>{m.role}</Badge>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Member invitations ship in Phase 6.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Security controls in place" />
          <CardBody>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>Row-level security isolates every table by organization.</li>
              <li>Every mutation re-checks your role on the server.</li>
              <li>All create, update and delete operations are written to an audit log.</li>
              <li>Sign-in, magic-link, sign-up and CSV import are rate limited.</li>
              <li>Mailbox tokens (Phase 2) are stored encrypted on the server and never sent to the browser.</li>
            </ul>
          </CardBody>
        </Card>
        {isAdmin && (
          <Card className="lg:col-span-2">
            <CardHeader title="Recent audit log" />
            <CardBody className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-2 pr-4">When</th><th className="pr-4">Action</th><th className="pr-4">Entity</th><th>Actor</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(audit.data ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="py-1.5 pr-4 text-slate-600">{formatDateTime(a.created_at)}</td>
                      <td className="pr-4 capitalize">{a.action}</td>
                      <td className="pr-4">{a.entity_type}</td>
                      <td className="font-mono text-xs text-slate-500">{a.actor_user_id === ctx.userId ? 'you' : (a.actor_user_id?.slice(0, 8) ?? 'system')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
