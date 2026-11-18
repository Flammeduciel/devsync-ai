import { promoteDeliverableSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Turn a published text deliverable into searchable knowledge. */
export const POST = handler(async (request: Request) => {
  const { actor } = await requireActor(request);
  return json(await services().knowledge.promoteDeliverable(actor, promoteDeliverableSchema.parse(await readJson(request))), 201);
});
