import type { RequestStatus } from '@devsync/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewRequestForm, type AssigneeOption } from '@/features/collaboration/new-request-form';
import { RequestFilters } from '@/features/collaboration/request-filters';
import { RequestStatusBadge } from '@/features/collaboration/status-badge';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { hasTeamPermission } from '@/server/domain/permissions';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Collaboration' };

export default async function RequestsPage({ params, searchParams }: PageProps<'/t/[teamSlug]/requests'>) {
  const { teamSlug } = await params;
  const query = await searchParams;
  const { user, team } = await loadTeamPage(teamSlug);
  const scope = query.scope === 'assigned' || query.scope === 'created' ? query.scope : 'all';
  const status = typeof query.status === 'string' ? [query.status as RequestStatus] : undefined;

  const [requests, projects, members, agents] = await Promise.all([
    services().requests.list(user.id, team.id, { scope, ...(status ? { status } : {}) }),
    services().projects.list(user.id, team.id),
    services().members.list(user.id, team.id),
    services().agents.listForTeam(user.id, team.id),
  ]);
  const assignees: AssigneeOption[] = [
    ...agents.filter((a) => a.user.id !== user.id).map((a) => ({ value: `agent:${a.id}`, label: `${a.user.name}'s agent (${a.name}, ${a.status.toLowerCase()})` })),
    ...members.filter((m) => m.id !== user.id).map((m) => ({ value: `user:${m.id}`, label: `${m.name} (developer)` })),
  ];
  const canCreate = hasTeamPermission(team.role, 'project:create');

  return (
    <>
      <PageHeader title="Collaboration" description="Requests between developers and their agents: knowledge, work, dependencies, reviews." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <section aria-label="Requests" className="space-y-4">
          <RequestFilters />
          {requests.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No request matches.</p>
          ) : (
            <ul className="grid gap-2">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/t/${teamSlug}/requests/${r.id}` as never} className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.title}</p>
                      <RequestStatusBadge status={r.status} awaitingApproval={r.awaitingApproval} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.type.toLowerCase()} · {r.priority.toLowerCase()} · {r.project.name} · {r.initiatorAgent ? `${r.createdBy.name}'s agent` : r.createdBy.name} → {r.assigneeUser?.name ?? '?'}
                      {r.assigneeAgent ? ' (agent)' : ''} · {timeAgo(r.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {canCreate ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>New request</CardTitle>
            </CardHeader>
            <CardContent>
              <NewRequestForm teamSlug={teamSlug} projects={projects.map(({ id, name }) => ({ id, name }))} assignees={assignees} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
