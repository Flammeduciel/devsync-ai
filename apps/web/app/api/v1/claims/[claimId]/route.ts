import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { pathId } from '@/server/http/request';
import { handler, noContent } from '@/server/http/respond';

export const DELETE = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/claims/[claimId]'>) => {
    const device = await requireDevice(request);
    const { claimId } = await ctx.params;
    await services().claims.release(device, pathId(claimId, 'Claim'));
    return noContent();
  },
);
