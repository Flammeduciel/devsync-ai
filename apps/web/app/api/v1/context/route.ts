import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Agent: team context for its project (`?projectId=` or `?remote=` of its Git origin). */
export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(await services().directory.context(device, readQuery(request)));
});
