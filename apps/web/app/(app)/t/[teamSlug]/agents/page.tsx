import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveAgents, type LiveAgent } from '@/features/agents/live-agents';
import { RevokeMachineButton } from '@/features/devices/revoke-machine-button';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Live agents' };

export default async function AgentsPage({ params }: PageProps<'/t/[teamSlug]/agents'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const [agents, machines] = await Promise.all([
    services().agents.listForTeam(user.id, team.id),
    services().devices.list(user.id, team.id),
  ]);

  return (
    <>
      <PageHeader title="Live agents" description="Claude Code agents of the team, from their Bridges' heartbeats and declarations." />
      <LiveAgents teamId={team.id} initial={JSON.parse(JSON.stringify(agents)) as LiveAgent[]} />
      <Card>
        <CardHeader>
          <CardTitle>Machines</CardTitle>
          <CardDescription>
            Paired with <code className="font-mono">devsync login</code>. Revoking a machine disconnects its Bridge immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No machine paired.</p>
          ) : (
            <ul className="divide-y">
              {machines.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <span aria-label={m.connected ? 'Bridge connected' : 'Bridge offline'} className={cn('size-2 rounded-full', m.connected ? 'bg-success' : 'bg-muted-foreground/40')} />
                      {m.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.user.name} · {m.os ?? 'unknown OS'} · Bridge {m.bridgeVersion ?? '?'} · {m.lastSeenAt ? `seen ${timeAgo(m.lastSeenAt)}` : 'never seen'}
                    </p>
                  </div>
                  <RevokeMachineButton teamId={team.id} machineId={m.id} name={m.name} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
