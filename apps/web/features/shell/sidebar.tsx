import { FolderGit2, LayoutDashboard, Settings, Users } from 'lucide-react';
import { NavLink } from './nav-link';
import { TeamSwitcher } from './team-switcher';
import { UserMenu } from './user-menu';

export function MainNav({ teamSlug, className }: { teamSlug: string; className?: string }) {
  const base = `/t/${teamSlug}`;
  return (
    <nav aria-label="Main" className={className}>
      <NavLink href={base} exact>
        <LayoutDashboard className="size-4" /> Dashboard
      </NavLink>
      <NavLink href={`${base}/projects`}>
        <FolderGit2 className="size-4" /> Projects
      </NavLink>
      <NavLink href={`${base}/members`}>
        <Users className="size-4" /> Members
      </NavLink>
      <NavLink href={`${base}/settings`}>
        <Settings className="size-4" /> Settings
      </NavLink>
    </nav>
  );
}

export function Sidebar({
  teamSlug,
  teams,
  user,
}: {
  teamSlug: string;
  teams: { slug: string; name: string }[];
  user: { name: string; email: string };
}) {
  return (
    <aside className="flex h-full flex-col gap-4 border-r bg-muted/30 p-3">
      <div className="px-2 pt-1 text-sm font-semibold tracking-tight">DevSync AI</div>
      <TeamSwitcher current={teamSlug} teams={teams} />
      <MainNav teamSlug={teamSlug} className="grid gap-0.5" />
      <div className="mt-auto">
        <UserMenu name={user.name} email={user.email} />
      </div>
    </aside>
  );
}
