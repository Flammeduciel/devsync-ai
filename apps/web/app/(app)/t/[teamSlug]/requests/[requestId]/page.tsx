import { isUuid } from '@devsync/shared';
import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequestActions } from '@/features/collaboration/request-actions';
import { RequestStatusBadge } from '@/features/collaboration/status-badge';
import { PageHeader } from '@/features/shell/page-header';
import { actionLabel, timeAgo } from '@/lib/format';
import { services } from '@/server/container';
import { loadTeamPage, orNotFound } from '@/server/http/page';

export const metadata: Metadata = { title: 'Request' };

export default async function RequestPage({ params }: PageProps<'/t/[teamSlug]/requests/[requestId]'>) {
  const { teamSlug, requestId } = await params;
  if (!isUuid(requestId)) notFound();
  const { user } = await loadTeamPage(teamSlug);
  const r = await orNotFound(services().requests.get({ type: 'HUMAN', userId: user.id }, requestId));
  const expected = r.expectedDeliverables as { title: string; format: string }[];

  return (
    <>
      <PageHeader
        title={r.title}
        description={`${r.type.toLowerCase()} · ${r.priority.toLowerCase()} priority · ${r.project.name}`}
        actions={<RequestStatusBadge status={r.status} awaitingApproval={r.awaitingApproval} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                From <strong className="text-foreground">{r.initiatorAgent ? `${r.createdBy.name}'s agent` : r.createdBy.name}</strong> to{' '}
                <strong className="text-foreground">{r.assigneeUser?.name ?? '?'}{r.assigneeAgent ? ' (agent)' : ''}</strong> · {timeAgo(r.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{r.description}</p>
              {r.instructions ? (
                <div>
                  <p className="font-medium">Instructions</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{r.instructions}</p>
                </div>
              ) : null}
              {expected.length ? (
                <div>
                  <p className="font-medium">Expected deliverables</p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {expected.map((d, i) => (
                      <li key={i}>
                        {d.title} ({d.format.toLowerCase()})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.awaitingApproval ? <p className="rounded-md bg-warning/20 p-3">This request was suggested by an agent and waits for {r.createdBy.name}&apos;s approval before the assignee sees it.</p> : null}
            </CardContent>
          </Card>

          {r.deliverables.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Deliverables</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {r.deliverables.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{d.title}</span> · {d.format.toLowerCase()} · v{d.currentVersion} · {d.status.toLowerCase()} · by {d.by}
                      </span>
                      {d.status === 'PUBLISHED' || r.yourRoles.includes('assignee') ? (
                        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/v1/deliverables/${d.id}/download`}>
                          <Download className="size-4" /> Open
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {r.comments.length === 0 ? <p className="text-sm text-muted-foreground">No message yet.</p> : null}
              <ul className="space-y-3">
                {r.comments.map((c) => (
                  <li key={c.id} className="rounded-md border p-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {c.author} · {timeAgo(c.at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
              <RequestActions requestId={r.id} actions={r.availableActions} canComment={r.yourRoles.length > 0} />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 border-l pl-4 text-sm">
              {r.history.map((h, i) => (
                <li key={i}>
                  <p className="font-medium">{actionLabel(h.action)}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.by} · {timeAgo(h.at)}
                  </p>
                </li>
              ))}
            </ol>
            {r.tasks.length ? <p className="mt-4 text-xs text-muted-foreground">Task: {r.tasks.map((t) => `${t.title} (${t.status.toLowerCase()})`).join(', ')}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
