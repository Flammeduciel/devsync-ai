import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SuspendButton } from '@/features/admin/controls';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  const user = await requireUser();
  const q = typeof (await searchParams).q === 'string' ? ((await searchParams).q as string) : '';
  const users = await services().platform.listUsers(user.id, q);
  return (
    <>
      <PageHeader title="Users" description={`${users.length} user(s)`} />
      <form>
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search by email or name"
          aria-label="Search users"
        />
      </form>
      <Card className="overflow-x-auto py-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">Teams</th>
              <th className="p-3 font-medium">Machines</th>
              <th className="p-3 font-medium">Last seen</th>
              <th className="p-3 font-medium">Joined</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className={u.suspendedAt ? 'bg-destructive/5' : ''}>
                <td className="p-3">
                  <span className="font-medium">{u.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {u.email}
                    {u.emailVerified ? '' : ' · unverified'}
                    {u.platformAdmin ? ' · platform admin' : ''}
                    {u.suspendedAt ? ' · suspended' : ''}
                  </span>
                </td>
                <td className="p-3">{u.teams}</td>
                <td className="p-3">{u.machines}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {u.lastSeenAt ? timeAgo(u.lastSeenAt) : '—'}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{timeAgo(u.createdAt)}</td>
                <td className="p-3 text-right">
                  {u.id === user.id ? null : (
                    <SuspendButton
                      kind="user"
                      id={u.id}
                      suspended={!!u.suspendedAt}
                      label={u.email}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
