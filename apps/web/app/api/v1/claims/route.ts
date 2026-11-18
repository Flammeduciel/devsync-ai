import { claimResourceSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Agent: claim a resource. 409 with `details.claim` when another agent holds it. */
export const POST = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(
    await services().claims.claim(device, claimResourceSchema.parse(await readJson(request))),
    201,
  );
});
