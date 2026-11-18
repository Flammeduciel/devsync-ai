import { GitBranch, GitFork } from 'lucide-react';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConflictActions } from '@/features/git/conflict-actions';
import { ConflictBadge } from '@/features/git/conflict-badge';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Git intelligence' };

export default async function GitPage({ params }: PageProps<'/t/[teamSlug]/git'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const repositories = await services().git.teamState(user.id, team.id);
  const conflicts = repositories.flatMap((r) => r.conflicts);

  return (
    <>
      <PageHeader title="Git intelligence" description="What each agent is changing, from read-only snapshots of their worktrees. DevSync never pushes, merges or edits code." />
      <Card>
        <CardHeader>
          <CardTitle>Overlap alerts</CardTitle>
          <CardDescription>Agents changing the same files or lines on different branches. Alerts close themselves when the overlap disappears.</CardDescription>
        </CardHeader>
        <CardContent>
          {conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No overlap right now.</p>
          ) : (
            <ul className="divide-y">
              {conflicts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <ConflictBadge kind={c.kind} /> <code className="font-mono text-xs">{c.filePath}</code>
                      <span className="text-xs text-muted-foreground">{c.repository}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.a.owner} <span className="font-mono">({c.a.branch}{c.details.linesA ? `, lines ${c.details.linesA}` : ''})</span> ↔ {c.b.owner}{' '}
                      <span className="font-mono">({c.b.branch}{c.details.linesB ? `, lines ${c.details.linesB}` : ''})</span>
                      {c.details.sharedLines ? ` · shared base lines ${c.details.sharedLines}` : ''} · {timeAgo(c.lastDetectedAt)}
                      {c.status === 'ACKNOWLEDGED' ? ' · acknowledged' : ''}
                    </p>
                  </div>
                  {[c.a.userId, c.b.userId].includes(user.id) ? <ConflictActions conflictId={c.id} status={c.status} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {repositories.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Link repositories to your projects to see Git activity.</p>
      ) : (
        repositories.map((repo) => (
          <Card key={repo.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitFork className="size-4" /> {repo.name}
              </CardTitle>
              <CardDescription>
                {repo.project} · <span className="font-mono">{repo.remoteUrl}</span> · default branch {repo.defaultBranch}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {repo.worktrees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agent activity in the last 24 hours.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Developer</th>
                        <th className="py-2 pr-3 font-medium">Branch</th>
                        <th className="py-2 pr-3 font-medium">Changes</th>
                        <th className="py-2 pr-3 font-medium">Last commit</th>
                        <th className="py-2 font-medium">Seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {repo.worktrees.map((w) => (
                        <tr key={`${w.machine}${w.worktreePath}`}>
                          <td className="py-2 pr-3">
                            {w.owner}
                            <span className="block text-xs text-muted-foreground">{w.machine}{w.isLinkedWorktree ? ' · linked worktree' : ''}</span>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            <span className="inline-flex items-center gap-1">
                              <GitBranch className="size-3" /> {w.branch}
                            </span>
                            <span className="block text-muted-foreground">
                              ↑{w.aheadBy} ↓{w.behindBy} · {w.head}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {w.changedFiles} file(s){w.unmergedFiles ? <span className="block text-xs text-destructive">{w.unmergedFiles} in merge conflict</span> : null}
                          </td>
                          <td className="max-w-56 truncate py-2 pr-3 text-xs text-muted-foreground">{w.lastCommitMessage ?? '—'}</td>
                          <td className="py-2 text-xs text-muted-foreground">{timeAgo(w.capturedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}
