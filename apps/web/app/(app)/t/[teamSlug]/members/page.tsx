import type { TeamRole } from '@devsync/validation';
import type { Metadata } from 'next';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteForm } from '@/features/members/invite-form';
import { MemberRowActions } from '@/features/members/member-row-actions';
import { RevokeInvitationButton } from '@/features/members/revoke-invitation-button';
import { PageHeader } from '@/features/shell/page-header';
import { roleLabel, timeAgo } from '@/lib/format';
import { canGrantRole, checkMemberChange, hasTeamPermission } from '@/server/domain/permissions';
import { services } from '@/server/container';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Members' };

const ROLES: TeamRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];

export default async function MembersPage({ params }: PageProps<'/t/[teamSlug]/members'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const canInvite = hasTeamPermission(team.role, 'member:invite');
  const [members, invitations] = await Promise.all([
    services().members.list(user.id, team.id),
    canInvite ? services().invitations.listPending(user.id, team.id) : Promise.resolve([]),
  ]);
  const ownerCount = members.filter((m) => m.role === 'OWNER').length;

  return (
    <>
      <PageHeader title="Members" description={`${members.length} member(s) in ${team.name}.`} />
      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They receive an email link valid for 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm teamId={team.id} roles={ROLES.filter((r) => canGrantRole(team.role, r))} />
          </CardContent>
        </Card>
      ) : null}
      <Card className="py-0">
        <ul className="divide-y">
          {members.map((member) => {
            const isSelf = member.id === user.id;
            const check = (newRole: TeamRole | null) =>
              checkMemberChange({ actorRole: team.role, actorIsTarget: isSelf, targetRole: member.role, newRole, ownerCount }) === null;
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name} {isSelf ? <span className="text-muted-foreground">(you)</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <MemberRowActions
                  teamId={team.id}
                  userId={member.id}
                  role={member.role}
                  assignableRoles={ROLES.filter((r) => r !== member.role && check(r))}
                  canRemove={check(null)}
                  isSelf={isSelf}
                />
              </li>
            );
          })}
        </ul>
      </Card>
      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    {invitation.email} <Badge variant="secondary">{roleLabel(invitation.role)}</Badge>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    invited by {invitation.invitedBy.name} {timeAgo(invitation.createdAt)}
                    <RevokeInvitationButton teamId={team.id} invitationId={invitation.id} />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
