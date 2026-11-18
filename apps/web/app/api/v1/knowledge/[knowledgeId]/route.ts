import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** `?version=N`; agents reading an item are recorded as relying on it (they hear when it changes). */
export const GET = handler(async (request: Request, ctx: RouteContext<'/api/v1/knowledge/[knowledgeId]'>) => {
  const { actor } = await requireActor(request);
  const { knowledgeId } = await ctx.params;
  const query = readQuery(request);
  const version = typeof query.version === 'string' && /^\d+$/.test(query.version) ? Number(query.version) : undefined;
  return json(await services().knowledge.get(actor, pathId(knowledgeId, 'Knowledge'), { ...(version ? { version } : {}), trackUsage: query.track === '1' || actor.type === 'AGENT' }));
});
