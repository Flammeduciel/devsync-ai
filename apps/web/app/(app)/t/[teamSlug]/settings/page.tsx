import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteTeamButton } from '@/features/settings/delete-team-button';
import { TeamSettingsForm } from '@/features/settings/team-settings-form';
import { PageHeader } from '@/features/shell/page-header';
import { roleLabel } from '@/lib/format';
import { hasTeamPermission } from '@/server/domain/permissions';
import { loadTeamPage } from '@/server/http/page';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: PageProps<'/t/[teamSlug]/settings'>) {
  const { teamSlug } = await params;
  const { team } = await loadTeamPage(teamSlug);
  const canUpdate = hasTeamPermission(team.role, 'team:update');

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
