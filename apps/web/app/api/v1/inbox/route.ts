import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';

/** Bridge / CLI: requests waiting for the device owner or their agents. */
export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json({ items: await services().inbox.forUser(device.userId, device.teamId) });
});
