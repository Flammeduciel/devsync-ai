import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  const query = readQuery(request);
  return json({
    items: await services().git.teamState(
      resolved.actor.userId,
      teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null),
    ),
  });
});
