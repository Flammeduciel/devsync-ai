import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { pathId } from '@/server/http/request';
import { handler, noContent } from '@/server/http/respond';

export const POST = handler(async (request: Request, ctx: RouteContext<'/api/v1/sessions/[sessionId]/end'>) => {
  const device = await requireDevice(request);
  const { sessionId } = await ctx.params;
  await services().agents.endSession(device, pathId(sessionId, 'Session'));
  return noContent();
});
