import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AutonomyForm } from '@/features/settings/autonomy-form';
import { DeleteTeamButton } from '@/features/settings/delete-team-button';
import { NotificationPreferences } from '@/features/settings/notification-preferences';
import { TeamSettingsForm } from '@/features/settings/team-settings-form';
import { PageHeader } from '@/features/shell/page-header';
import { roleLabel } from '@/lib/format';
import { hasTeamPermission } from '@/server/domain/permissions';
import { loadTeamPage } from '@/server/http/page';
import { services } from '@/server/container';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: PageProps<'/t/[teamSlug]/settings'>) {
  const { teamSlug } = await params;
  const { user, team } = await loadTeamPage(teamSlug);
  const canUpdate = hasTeamPermission(team.role, 'team:update');
  const [autonomy, preferences] = await Promise.all([services().autonomy.list(user.id, team.id), services().notifications.preferences(user.id, team.id)]);

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Your role in this team: ${roleLabel(team.role)}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          {canUpdate ? (
            <TeamSettingsForm teamId={team.id} name={team.name} slug={team.slug} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only owners and admins can change team settings.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Agent autonomy</CardTitle>
          <CardDescription>What agents may do on their own when they need something from a teammate. Every agent request is audited.</CardDescription>
        </CardHeader>
        <CardContent>
          <AutonomyForm teamId={team.id} policy={autonomy.teamDefault} editable={hasTeamPermission(team.role, 'settings:manage')} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My notifications</CardTitle>
          <CardDescription>How you are told about events in this team.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferences teamId={team.id} initial={preferences} />
        </CardContent>
      </Card>
      {hasTeamPermission(team.role, 'team:delete') ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Delete team</CardTitle>
            <CardDescription>
              Projects, members and agents of this team become inaccessible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteTeamButton teamId={team.id} teamName={team.name} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
