import { setVisibilitySchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Author only: share a private item with the project, or make it private again. */
export const PATCH = handler(async (request: Request, ctx: RouteContext<'/api/v1/knowledge/[knowledgeId]/visibility'>) => {
  const { actor } = await requireActor(request);
  const { knowledgeId } = await ctx.params;
  return json(await services().knowledge.setVisibility(actor, pathId(knowledgeId, 'Knowledge'), setVisibilitySchema.parse(await readJson(request))));
});
