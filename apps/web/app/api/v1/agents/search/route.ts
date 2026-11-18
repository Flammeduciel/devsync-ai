import { agentSearchSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  const query = readQuery(request);
  const status = query.status === undefined ? undefined : ([] as string[]).concat(query.status);
  return json({
    items: await services().directory.searchAgents(
      device,
      agentSearchSchema.parse({ ...query, status }),
    ),
  });
});
