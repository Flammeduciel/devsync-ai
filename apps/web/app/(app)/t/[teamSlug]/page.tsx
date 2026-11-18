import { Bot, FolderGit2, GitBranch, Inbox, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/features/dashboard/stat-card';
import { PageHeader } from '@/features/shell/page-header';
import { actionLabel, timeAgo } from '@/lib/format';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({ params }: PageProps<'/t/[teamSlug]'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const { counts, recentProjects, activity } = await services().dashboard.overview(
    user.id,
    team.id,
  );

  return (
    <>
      <PageHeader title={team.name} description="Your team at a glance." />
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Developers"
          value={counts.members}
          icon={Users}
          hint={
            counts.pendingInvitations
              ? `${counts.pendingInvitations} invitation(s) pending`
              : undefined
          }
        />
        <StatCard
          label="Agents connected"
          value={counts.agentsOnline}
          icon={Bot}
          hint={`${counts.agentsActive} working`}
        />
        <StatCard label="Projects" value={counts.projects} icon={FolderGit2} />
        <StatCard label="Repositories" value={counts.repositories} icon={GitBranch} />
        <StatCard label="Pending requests" value={counts.pendingRequests} icon={Inbox} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No project yet.{' '}
                <Link
                  className="underline underline-offset-4"
                  href={`/t/${teamSlug}/projects` as never}
                >
                  Create the first one
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/t/${teamSlug}/projects/${project.id}` as never}
                      className="flex items-center justify-between py-2 text-sm hover:underline"
                    >
                      {project.name}
                      <span className="text-xs text-muted-foreground">
                        {project._count.repositories} repo(s)
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {team.role === 'OWNER' || team.role === 'ADMIN'
                  ? 'Nothing yet.'
                  : 'The audit trail is visible to owners and admins.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 text-sm">
                    <span>
                      <span className="font-medium">{entry.actor}</span> ·{' '}
                      {actionLabel(entry.action)}
                    </span>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={entry.createdAt.toISOString()}
                    >
                      {timeAgo(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
