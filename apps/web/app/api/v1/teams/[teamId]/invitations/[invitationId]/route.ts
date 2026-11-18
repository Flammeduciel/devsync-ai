import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, noContent } from '@/server/http/respond';
import { pathId } from '@/server/http/request';

export const DELETE = handler(
  async (
    _request: Request,
    ctx: RouteContext<'/api/v1/teams/[teamId]/invitations/[invitationId]'>,
  ) => {
    const user = await requireApiUser();
    const { teamId, invitationId } = await ctx.params;
    await services().invitations.revoke(
      user.id,
      pathId(teamId, 'Team'),
      pathId(invitationId, 'Invitation'),
    );
    return noContent();
  },
);
