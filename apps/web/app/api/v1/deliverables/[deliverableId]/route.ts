import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** `?version=N` (default latest), `?inline=1` returns text content ≤ 1 MB for agents. */
export const GET = handler(async (request: Request, ctx: RouteContext<'/api/v1/deliverables/[deliverableId]'>) => {
  const { actor } = await requireActor(request);
  const { deliverableId } = await ctx.params;
  const query = readQuery(request);
  const version = typeof query.version === 'string' && /^\d+$/.test(query.version) ? Number(query.version) : undefined;
  return json(await services().deliverables.read(actor, pathId(deliverableId, 'Deliverable'), { ...(version ? { version } : {}), inline: query.inline === '1' || query.inline === 'true' }));
});
