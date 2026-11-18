import { commentSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const POST = handler(async (request: Request, ctx: RouteContext<'/api/v1/collaboration/[requestId]/comments'>) => {
  const { actor } = await requireActor(request);
  const { requestId } = await ctx.params;
  return json(await services().requests.comment(actor, pathId(requestId, 'Request'), commentSchema.parse(await readJson(request))), 201);
});
