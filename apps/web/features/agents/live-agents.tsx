'use client';

import type { AgentStatus } from '@devsync/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, GitBranch } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRealtime } from '../realtime/use-realtime';
import { AgentStatusBadge } from './status-badge';

export interface LiveAgent {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask: string | null;
  specialties: string[];
  pluginVersion: string | null;
  lastActivityAt: string | null;
  user: { id: string; name: string };
  machine: { id: string; name: string };
  sessions: { id: string; status: AgentStatus; branch: string | null; lastHeartbeatAt: string; project: { id: string; name: string } | null }[];
}

async function fetchAgents(teamId: string): Promise<LiveAgent[]> {
  const response = await fetch(`/api/v1/teams/${teamId}/agents`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load agents');
  return (await response.json()).items;
}

export function LiveAgents({ teamId, initial }: { teamId: string; initial: LiveAgent[] }) {
  const queryClient = useQueryClient();
  const { data: agents } = useQuery({
    queryKey: ['agents', teamId],
    queryFn: () => fetchAgents(teamId),
    initialData: initial,
    refetchInterval: 60_000,
  });
  const status = useRealtime((event) => {
    if (event.teamId === teamId && event.type.startsWith('agent.')) {
      void queryClient.invalidateQueries({ queryKey: ['agents', teamId] });
    }
  });

  const sorted = [...agents].sort((a, b) => Number(a.status === 'OFFLINE') - Number(b.status === 'OFFLINE'));

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span className={cn('size-2 rounded-full', status === 'live' ? 'bg-success' : status === 'connecting' ? 'bg-warning' : 'bg-destructive')} />
        {status === 'live' ? 'Live updates' : status === 'connecting' ? 'Connecting…' : 'Live updates unavailable, refreshing every minute'}
      </p>
      {sorted.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Bot className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No agent connected yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Install the Bridge, run <code className="font-mono">devsync login</code> then <code className="font-mono">devsync start</code>. Agents appear here when a Claude Code session starts.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sorted.map((agent) => (
            <li key={agent.id}>
              <Card className={cn('gap-3 p-4', agent.status === 'OFFLINE' && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {agent.user.name} · <span className="text-muted-foreground">{agent.name}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {agent.machine.name}
                      {agent.pluginVersion ? ` · plugin ${agent.pluginVersion}` : ''}
                    </p>
                  </div>
                  <AgentStatusBadge status={agent.status} />
                </div>
                {agent.currentTask ? <p className="text-sm">{agent.currentTask}</p> : null}
                {agent.sessions.length > 0 ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {agent.sessions.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                        <span>{s.project?.name ?? 'No project'}</span>
                        {s.branch ? (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <GitBranch className="size-3" />
                            {s.branch}
                          </span>
                        ) : null}
                        <span>· seen {timeAgo(s.lastHeartbeatAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {agent.lastActivityAt ? `Last activity ${timeAgo(agent.lastActivityAt)}` : 'Never active'}
                  </p>
                )}
                {agent.specialties.length ? (
                  <p className="flex flex-wrap gap-1">
                    {agent.specialties.map((s) => (
                      <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {s}
                      </span>
                    ))}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
