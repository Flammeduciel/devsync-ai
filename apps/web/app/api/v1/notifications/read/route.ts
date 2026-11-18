import { z } from 'zod';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

const schema = z.object({
  teamId: z.uuid().optional(),
  ids: z.union([z.literal('all'), z.array(z.uuid()).max(200)]),
});

export const POST = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  const input = schema.parse(await readJson(request));
  return json(
    await services().notifications.markRead(
      resolved.actor.userId,
      teamOf(resolved, input.teamId ?? null),
      input.ids,
    ),
  );
});
