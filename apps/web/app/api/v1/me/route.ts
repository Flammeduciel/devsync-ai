import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';

/** Bridge / CLI: who this device token belongs to (`devsync status`). */
export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(await services().devices.whoami(device));
});
