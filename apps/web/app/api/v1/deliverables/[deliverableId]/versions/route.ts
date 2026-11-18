import { deliverableVersionSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const POST = handler(async (request: Request, ctx: RouteContext<'/api/v1/deliverables/[deliverableId]/versions'>) => {
  const { actor } = await requireActor(request);
  const { deliverableId } = await ctx.params;
  return json(await services().deliverables.addVersion(actor, pathId(deliverableId, 'Deliverable'), deliverableVersionSchema.parse(await readJson(request))), 201);
});
