import { publishActivitySchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const POST = handler(async (request: Request) => {
  const device = await requireDevice(request);
  const result = await services().agents.publishActivity(
    device,
    publishActivitySchema.parse(await readJson(request)),
  );
  return json(result, result.duplicate ? 200 : 201);
});
