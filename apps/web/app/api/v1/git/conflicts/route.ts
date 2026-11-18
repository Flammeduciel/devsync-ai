import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  const query = readQuery(request);
  const teamId = teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
  return json({
    items: await services().git.listConflicts(resolved.actor.userId, teamId, {
      status: query.status === 'all' ? 'all' : 'open',
    }),
  });
});
