import { deviceAuthorizeSchema } from '@devsync/validation';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';
import { clientIp, rateLimit } from '@/server/infrastructure/rate-limit';

/** Public: starts `devsync login`. */
export const POST = handler(async (request: Request) => {
  await rateLimit(`device-authorize:${clientIp(request)}`, 10, 60);
  return json(await services().devices.authorize(deviceAuthorizeSchema.parse(await readJson(request))), 201);
});
