import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { serverEnv } from '@/server/env';
import { handler, json } from '@/server/http/respond';

/** Bridge / CLI: who this device token belongs to (`devsync status`) and where the gateway lives. */
export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json({ ...(await services().devices.whoami(device)), realtimeUrl: serverEnv().REALTIME_URL });
});
