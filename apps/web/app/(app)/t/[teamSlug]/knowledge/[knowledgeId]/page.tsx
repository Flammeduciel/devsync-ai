import { isUuid } from '@devsync/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KnowledgeControls } from '@/features/knowledge/knowledge-controls';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { services } from '@/server/container';
import { loadTeamPage, orNotFound } from '@/server/http/page';

export const metadata: Metadata = { title: 'Knowledge' };

export default async function KnowledgeItemPage({ params, searchParams }: PageProps<'/t/[teamSlug]/knowledge/[knowledgeId]'>) {
  const { teamSlug, knowledgeId } = await params;
  if (!isUuid(knowledgeId)) notFound();
  const query = await searchParams;
  const { user } = await loadTeamPage(teamSlug);
  const version = typeof query.v === 'string' && /^\d+$/.test(query.v) ? Number(query.v) : undefined;
  const k = await orNotFound(services().knowledge.get({ type: 'HUMAN', userId: user.id }, knowledgeId, version ? { version } : {}));
  const project = await services().projects.get(user.id, k.project.id);

  return (
    <>
      <PageHeader
        title={k.title}
        description={`${k.kind.toLowerCase().replace('_', ' ')} · ${k.project.name} · by ${k.author} · ${timeAgo(k.publishedAt)}`}
        actions={<KnowledgeControls knowledgeId={k.id} visibility={k.visibility} validity={k.validity} isAuthor={k.isAuthor} canManage={project.access === 'manage'} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent className="space-y-3">
            {k.visibility === 'PRIVATE' ? <p className="rounded-md bg-warning/20 p-3 text-sm">Private: only you and your agents can see this.</p> : null}
            {k.validity !== 'VALID' ? <p className="rounded-md bg-muted p-3 text-sm">Marked {k.validity.toLowerCase()}.</p> : null}
            {k.version !== k.currentVersion ? (
              <p className="text-sm">
                You are viewing v{k.version}.{' '}
                <Link className="underline" href={`/t/${teamSlug}/knowledge/${k.id}` as never}>
                  Latest is v{k.currentVersion}
                </Link>
              </p>
            ) : null}
            {k.summary ? <p className="font-medium">{k.summary}</p> : null}
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{k.content}</pre>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {k.versions.map((v) => (
                  <li key={v.version}>
                    <Link className={v.version === k.version ? 'font-medium' : 'text-muted-foreground hover:underline'} href={`/t/${teamSlug}/knowledge/${k.id}?v=${v.version}` as never}>
                      v{v.version}
                    </Link>{' '}
                    <span className="text-xs text-muted-foreground">
                      {v.by} · {timeAgo(v.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {k.tags.length || k.references.length ? (
            <Card>
              <CardContent className="space-y-2 text-sm">
                {k.tags.length ? <p>#{k.tags.join(' #')}</p> : null}
                {k.references.map((r, i) => (
                  <p key={i} className="truncate font-mono text-xs text-muted-foreground">
                    {r.type}: {r.ref}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
