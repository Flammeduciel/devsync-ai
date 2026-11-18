import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { pathId } from '@/server/http/request';
import { handler, noContent } from '@/server/http/respond';

/** Revokes the device token: the Bridge is disconnected and its sessions end. */
export const DELETE = handler(
  async (_request: Request, ctx: RouteContext<'/api/v1/teams/[teamId]/machines/[machineId]'>) => {
    const user = await requireApiUser();
    const { teamId, machineId } = await ctx.params;
    await services().devices.revoke(user.id, pathId(teamId, 'Team'), pathId(machineId, 'Machine'));
    return noContent();
  },
);
