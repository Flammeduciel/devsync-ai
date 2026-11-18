import { Bell, BookOpen, Bot, FolderGit2, Handshake, LayoutDashboard, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from './nav-link';
import { TeamSwitcher } from './team-switcher';
import { UserMenu } from './user-menu';

export function MainNav({
  teamSlug,
  className,
  unread,
}: {
  teamSlug: string;
  className?: string;
  unread?: ReactNode;
}) {
  const base = `/t/${teamSlug}`;
  return (
    <nav aria-label="Main" className={className}>
      <NavLink href={base} exact>
        <LayoutDashboard className="size-4" /> Dashboard
      </NavLink>
      <NavLink href={`${base}/agents`}>
        <Bot className="size-4" /> Live agents
      </NavLink>
      <NavLink href={`${base}/requests`}>
        <Handshake className="size-4" /> Collaboration
      </NavLink>
      <NavLink href={`${base}/knowledge`}>
        <BookOpen className="size-4" /> Knowledge
      </NavLink>
      <NavLink href={`${base}/notifications`}>
        <Bell className="size-4" /> Notifications {unread}
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
  unread,
}: {
  teamSlug: string;
  teams: { slug: string; name: string }[];
  user: { name: string; email: string };
  unread?: ReactNode;
}) {
  return (
    <aside className="flex h-full flex-col gap-4 border-r bg-muted/30 p-3">
      <div className="px-2 pt-1 text-sm font-semibold tracking-tight">DevSync AI</div>
      <TeamSwitcher current={teamSlug} teams={teams} />
      <MainNav teamSlug={teamSlug} className="grid gap-0.5" unread={unread} />
      <div className="mt-auto">
        <UserMenu name={user.name} email={user.email} />
      </div>
    </aside>
  );
}
