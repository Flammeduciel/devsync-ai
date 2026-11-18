import { listKnowledgeSchema, publishKnowledgeSchema } from '@devsync/validation';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Browse knowledge (`?mine=1&visibility=PRIVATE` lists your own items, private ones included). */
export const GET = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  const query = readQuery(request);
  const teamId = teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
  return json({ items: await services().knowledge.list(resolved.actor.userId, teamId, listKnowledgeSchema.parse(query)) });
});

/** Publish an item or a new version. Nothing is shared unless published, and PRIVATE stays with its author. */
export const POST = handler(async (request: Request) => {
  const { actor, device } = await requireActor(request);
  return json(await services().knowledge.publish(actor, publishKnowledgeSchema.parse(await readJson(request)), device ?? undefined), 201);
});
