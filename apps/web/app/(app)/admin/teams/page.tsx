import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SuspendButton } from '@/features/admin/controls';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';

export default async function AdminTeamsPage({ searchParams }: PageProps<'/admin/teams'>) {
  const user = await requireUser();
  const q = typeof (await searchParams).q === 'string' ? ((await searchParams).q as string) : '';
  const teams = await services().platform.listTeams(user.id, q);
  return (
    <>
      <PageHeader title="Teams" description={`${teams.length} team(s)`} />
      <form>
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search by name or slug"
          aria-label="Search teams"
        />
      </form>
      <Card className="overflow-x-auto py-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Team</th>
              <th className="p-3 font-medium">Members</th>
              <th className="p-3 font-medium">Projects</th>
              <th className="p-3 font-medium">Agents / machines</th>
              <th className="p-3 font-medium">Last agent activity</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {teams.map((t) => (
              <tr key={t.id} className={t.suspendedAt ? 'bg-destructive/5' : ''}>
                <td className="p-3">
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.slug}
                    {t.suspendedAt ? ' · suspended' : ''}
                  </span>
                </td>
                <td className="p-3">{t.members}</td>
                <td className="p-3">{t.projects}</td>
                <td className="p-3">
                  {t.agents} / {t.machines}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {t.lastAgentActivity ? timeAgo(t.lastAgentActivity) : '—'}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{timeAgo(t.createdAt)}</td>
                <td className="p-3 text-right">
                  <SuspendButton
                    kind="team"
                    id={t.id}
                    suspended={!!t.suspendedAt}
                    label={`team "${t.name}"`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
