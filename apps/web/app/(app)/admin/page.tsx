import { Bot, FolderGit2, GitMerge, Inbox, Laptop, Library, UserPlus, Users, Users2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignupModeSelect } from '@/features/admin/controls';
import { StatCard } from '@/features/dashboard/stat-card';
import { PageHeader } from '@/features/shell/page-header';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { db } from '@/server/infrastructure/database';
import { redis } from '@/server/infrastructure/redis';
import { bucketExists } from '@/server/infrastructure/storage';
import { checkHealth } from '@/server/services/health.service';

export default async function AdminOverviewPage() {
  const user = await requireUser();
  const [o, health] = await Promise.all([
    services().platform.overview(user.id),
    checkHealth({ database: () => db().$queryRaw`SELECT 1`, redis: () => redis().ping(), storage: async () => { if (!(await bucketExists())) throw new Error('bucket missing'); } }),
  ]);
  const embeddingWorkers = await services().platform.embeddingWorkers();

  return (
    <>
      <PageHeader title="Overview" description="Instance-wide figures. Team content is never shown here." />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Users" value={o.users} icon={Users} hint={o.suspendedUsers ? `${o.suspendedUsers} suspended` : undefined} />
        <StatCard label="New users (7 d)" value={o.newUsers} icon={UserPlus} />
        <StatCard label="Teams" value={o.teams} icon={Users2} hint={o.suspendedTeams ? `${o.suspendedTeams} suspended` : undefined} />
        <StatCard label="Projects" value={o.projects} icon={FolderGit2} />
        <StatCard label="Agents online" value={o.agentsOnline} icon={Bot} />
        <StatCard label="Paired machines" value={o.machines} icon={Laptop} />
        <StatCard label="Open requests" value={o.openRequests} icon={Inbox} />
        <StatCard label="Knowledge items" value={o.knowledge} icon={Library} />
        <StatCard label="Git alerts" value={o.gitAlerts} icon={GitMerge} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {health.checks.map((c) => (
                <li key={c.name} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className={c.ok ? 'text-success' : 'text-destructive'}>{c.ok ? `ok · ${c.latencyMs} ms` : c.error}</span>
                </li>
              ))}
              <li className="flex justify-between">
                <span>embeddings worker</span>
                <span className={embeddingWorkers > 0 ? 'text-success' : 'text-warning'}>{embeddingWorkers > 0 ? `${embeddingWorkers} running` : 'not running (text search only)'}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sign-up</CardTitle>
            <CardDescription>Who can create an account on this instance. Platform admins can always sign up.</CardDescription>
          </CardHeader>
          <CardContent>
            <SignupModeSelect value={o.signupMode} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
