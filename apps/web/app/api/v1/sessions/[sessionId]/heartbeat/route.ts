import { heartbeatSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const POST = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/sessions/[sessionId]/heartbeat'>) => {
    const device = await requireDevice(request);
    const { sessionId } = await ctx.params;
    return json(
      await services().agents.heartbeat(
        device,
        pathId(sessionId, 'Session'),
        heartbeatSchema.parse(await readJson(request)),
      ),
    );
  },
);
