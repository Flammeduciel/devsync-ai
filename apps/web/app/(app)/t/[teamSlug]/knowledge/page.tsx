import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PublishKnowledgeForm } from '@/features/knowledge/publish-form';
import { KnowledgeSearchBox } from '@/features/knowledge/search-box';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { services } from '@/server/container';
import { hasTeamPermission } from '@/server/domain/permissions';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Knowledge' };

interface Row {
  id: string;
  title: string;
  kind: string;
  validity: string;
  visibility: string;
  version: number;
  project: string;
  author: string;
  tags: string[];
  meta?: string;
}

export default async function KnowledgePage({
  params,
  searchParams,
}: PageProps<'/t/[teamSlug]/knowledge'>) {
  const { teamSlug } = await params;
  const query = await searchParams;
  const { user, team } = await loadTeamPage(teamSlug);
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  const filter = query.filter === 'mine' || query.filter === 'private' ? query.filter : null;
  const actor = { type: 'HUMAN' as const, userId: user.id };

  let rows: Row[];
  let semantic: boolean | null = null;
  if (q.length >= 2) {
    const r = await services().knowledge.search(actor, team.id, {
      query: q,
      includeOutdated: true,
    });
    semantic = r.semantic;
    rows = r.items
      .filter((k) => !filter || (filter === 'private' ? k.visibility === 'PRIVATE' : k.author))
      .map((k) => ({
        ...k,
        meta: `${k.matchedBy.join(', ')}${k.summary ? ` — ${k.summary}` : ''}`,
      }));
  } else {
    rows = (
      await services().knowledge.list(user.id, team.id, {
        ...(filter ? { mine: true } : {}),
        ...(filter === 'private' ? { visibility: 'PRIVATE' } : {}),
      })
    ).map((k) => ({ ...k, meta: `${k.readers} reader(s) · ${timeAgo(k.publishedAt)}` }));
  }
  const projects = hasTeamPermission(team.role, 'project:create')
    ? await services().projects.list(user.id, team.id)
    : [];

  return (
    <>
      <PageHeader
        title="Knowledge"
        description="Decisions, contracts, analyses and project understanding published by the team and its agents — never raw conversations."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <section aria-label="Knowledge" className="space-y-4">
          <KnowledgeSearchBox />
          {semantic === false ? (
            <p className="text-xs text-muted-foreground">
              Semantic search is not running (embeddings worker stopped): text matches only.
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {q ? 'Nothing found.' : 'No knowledge published yet.'}
            </p>
          ) : (
            <ul className="grid gap-2">
              {rows.map((k) => (
                <li key={k.id}>
                  <Link
                    href={`/t/${teamSlug}/knowledge/${k.id}` as never}
                    className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{k.title}</p>
                      <span className="flex gap-1 text-xs">
                        {k.visibility === 'PRIVATE' ? (
                          <span className="rounded bg-warning/25 px-1.5 py-0.5">private</span>
                        ) : null}
                        {k.validity !== 'VALID' ? (
                          <span className="rounded bg-muted px-1.5 py-0.5">
                            {k.validity.toLowerCase()}
                          </span>
                        ) : null}
                        <span className="rounded bg-accent px-1.5 py-0.5">
                          {k.kind.toLowerCase().replace('_', ' ')}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {k.project} · v{k.version} · {k.author}
                      {k.tags.length ? ` · #${k.tags.join(' #')}` : ''}
                    </p>
                    {k.meta ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{k.meta}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {projects.length ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Publish</CardTitle>
            </CardHeader>
            <CardContent>
              <PublishKnowledgeForm
                teamSlug={teamSlug}
                projects={projects.map(({ id, name }) => ({ id, name }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
