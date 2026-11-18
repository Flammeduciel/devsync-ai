import { checkOverlapSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Agent: who else is changing (or has claimed) these files right now? */
export const POST = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(
    await services().git.checkOverlap(device, checkOverlapSchema.parse(await readJson(request))),
  );
});
