import { AppError } from '@devsync/shared';
import { createTaskSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Agent: declare a task (so other requests can depend on it). */
export const POST = handler(async (request: Request) => {
  const { actor, device } = await requireActor(request);
  if (!device) throw new AppError('FORBIDDEN', 'Tasks are declared by agents');
  return json(
    await services().tasks.create(device, actor, createTaskSchema.parse(await readJson(request))),
    201,
  );
});
