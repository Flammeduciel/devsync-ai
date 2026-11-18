import { createRequestSchema, listRequestsSchema } from '@devsync/validation';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** List visible requests (`?teamId=` for developers; agents use their device's team). */
export const GET = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  const query = readQuery(request);
  const teamId = teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
  const status = query.status === undefined ? undefined : ([] as string[]).concat(query.status);
  return json({ items: await services().requests.list(resolved.actor.userId, teamId, listRequestsSchema.parse({ ...query, status })) });
});

/** Create a request. Agents are subject to the team's autonomy policy. */
export const POST = handler(async (request: Request) => {
  const { actor, device } = await requireActor(request);
  return json(await services().requests.create(actor, createRequestSchema.parse(await readJson(request)), device ?? undefined), 201);
});
