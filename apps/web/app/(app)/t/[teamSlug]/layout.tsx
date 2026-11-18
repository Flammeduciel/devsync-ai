import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';
import { RealtimeRefresh, UnreadBadge } from '@/features/notifications/live-unread';
import { MainNav, Sidebar } from '@/features/shell/sidebar';
import { TeamSwitcher } from '@/features/shell/team-switcher';

export default async function TeamLayout({ children, params }: LayoutProps<'/t/[teamSlug]'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const [teams, { unread }] = await Promise.all([
    services().teams.listMine(user.id),
    services().notifications.list(user.id, team.id, { unreadOnly: true, limit: 1 }),
  ]);
  const badge = <UnreadBadge count={unread} />;
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="hidden md:block">
        <div className="sticky top-0 h-dvh">
          <Sidebar
            teamSlug={teamSlug}
            teams={teams.map(({ slug, name }) => ({ slug, name }))}
            user={user}
            unread={badge}
          />
        </div>
      </div>
      {/* Mobile: team switcher + horizontally scrollable navigation. */}
      <div className="space-y-2 border-b p-3 md:hidden">
        <TeamSwitcher current={teamSlug} teams={teams.map(({ slug, name }) => ({ slug, name }))} />
        <MainNav teamSlug={teamSlug} className="flex gap-1 overflow-x-auto" unread={badge} />
      </div>
      <RealtimeRefresh />
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
