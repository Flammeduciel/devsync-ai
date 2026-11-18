import { AppError } from '@devsync/shared';
import { broadcastSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';
import { rateLimit } from '@/server/infrastructure/rate-limit';

/** Agent: short message to every member of its project (10 per hour per agent). */
export const POST = handler(async (request: Request) => {
  const { actor, device } = await requireActor(request);
  if (!device || actor.type !== 'AGENT') throw new AppError('FORBIDDEN', 'Broadcasts are sent by agents');
  await rateLimit(`broadcast:${actor.agentId}`, 10, 3600);
  return json(await services().notifications.broadcast(actor, device, broadcastSchema.parse(await readJson(request))), 201);
});
