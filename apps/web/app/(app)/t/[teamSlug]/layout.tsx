import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';
import { MainNav, Sidebar } from '@/features/shell/sidebar';
import { TeamSwitcher } from '@/features/shell/team-switcher';

export default async function TeamLayout({ children, params }: LayoutProps<'/t/[teamSlug]'>) {
  const { teamSlug } = await params;
  const { user } = await loadTeamPage(teamSlug);
  const teams = await services().teams.listMine(user.id);
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="hidden md:block">
        <div className="sticky top-0 h-dvh">
          <Sidebar
            teamSlug={teamSlug}
            teams={teams.map(({ slug, name }) => ({ slug, name }))}
            user={user}
          />
        </div>
      </div>
      {/* Mobile: team switcher + horizontally scrollable navigation. */}
      <div className="space-y-2 border-b p-3 md:hidden">
        <TeamSwitcher current={teamSlug} teams={teams.map(({ slug, name }) => ({ slug, name }))} />
        <MainNav teamSlug={teamSlug} className="flex gap-1 overflow-x-auto" />
      </div>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
