import { isUuid } from '@devsync/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AddRepositoryForm } from '@/features/projects/add-repository-form';
import { AddProjectMemberForm, RemoveButton } from '@/features/projects/project-member-controls';
import { PageHeader } from '@/features/shell/page-header';
import { roleLabel } from '@/lib/format';
import { services } from '@/server/container';
import { loadTeamPage, orNotFound } from '@/server/http/page';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectPage({ params }: PageProps<'/t/[teamSlug]/projects/[projectId]'>) {
  const { teamSlug, projectId } = await params;
  if (!isUuid(projectId)) notFound();
  const { user, team } = await loadTeamPage(teamSlug);
  const project = await orNotFound(services().projects.get(user.id, projectId));
  if (project.teamId !== team.id) notFound();

  const canManage = project.access === 'manage';
  const [members, repositories, teamMembers] = await Promise.all([
    services().projects.listMembers(user.id, projectId),
    services().projects.listRepositories(user.id, projectId),
    canManage ? services().members.list(user.id, team.id) : Promise.resolve([]),
  ]);
  const memberIds = new Set(members.map((m) => m.id));

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={<Badge variant="outline">{project.access === 'manage' ? 'You manage this project' : `Access: ${project.access}`}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
            <CardDescription>Git remotes the Bridge will watch for this project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {repositories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repository linked.</p>
            ) : (
              <ul className="divide-y">
                {repositories.map((repo) => (
                  <li key={repo.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{repo.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {repo.remoteUrl} · {repo.defaultBranch}
                      </p>
                    </div>
                    {canManage ? <RemoveButton kind="repository" projectId={projectId} id={repo.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
            {canManage ? <AddRepositoryForm projectId={projectId} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Team owners and admins always have access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Avatar name={member.name} className="size-7" />
                    <span className="truncate">{member.name}</span>
                    <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                  </span>
                  {canManage ? <RemoveButton kind="member" projectId={projectId} id={member.id} /> : null}
                </li>
              ))}
            </ul>
            {canManage ? (
              <AddProjectMemberForm
                projectId={projectId}
                candidates={teamMembers.filter((m) => !memberIds.has(m.id)).map(({ id, name }) => ({ id, name }))}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
