import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateProjectForm } from '@/features/projects/create-project-form';
import { PageHeader } from '@/features/shell/page-header';
import { timeAgo } from '@/lib/format';
import { hasTeamPermission } from '@/server/domain/permissions';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage({ params }: PageProps<'/t/[teamSlug]/projects'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const projects = await services().projects.list(user.id, team.id);
  const canCreate = hasTeamPermission(team.role, 'project:create');

  return (
    <>
      <PageHeader
        title="Projects"
        description={hasTeamPermission(team.role, 'project:read_all') ? 'All projects of the team.' : 'Projects you have access to.'}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Project list" className="grid content-start gap-3">
          {projects.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No project yet.</p>
          ) : (
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/t/${teamSlug}/projects/${project.id}` as never}
                className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-medium">{project.name}</h2>
                  <span className="text-xs text-muted-foreground">created {timeAgo(project.createdAt)}</span>
                </div>
                {project.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{project.description}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {project._count.members} member(s) · {project._count.repositories} repo(s)
                </p>
              </Link>
            ))
          )}
        </section>
        {canCreate ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>New project</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateProjectForm teamId={team.id} teamSlug={teamSlug} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
