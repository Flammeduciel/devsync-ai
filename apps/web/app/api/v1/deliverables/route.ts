import { createDeliverableSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const POST = handler(async (request: Request) => {
  const { actor, device } = await requireActor(request);
  return json(await services().deliverables.create(actor, createDeliverableSchema.parse(await readJson(request)), device ?? undefined), 201);
});
