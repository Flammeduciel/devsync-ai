import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';

/** Bridge / CLI / MCP: open requests for the device owner and deliverables received recently. */
export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  const [items, delivered] = await Promise.all([
    services().inbox.forUser(device.userId, device.teamId),
    services().inbox.deliveredToUser(device.userId, device.teamId),
  ]);
  return json({ items, delivered });
});
