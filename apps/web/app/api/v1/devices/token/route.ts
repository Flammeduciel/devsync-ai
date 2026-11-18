import { sha256Hex } from '@devsync/shared';
import { deviceTokenRequestSchema } from '@devsync/validation';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';
import { rateLimit } from '@/server/infrastructure/rate-limit';

/** Public: polled by the Bridge until the user approves (or denies) in the browser. */
export const POST = handler(async (request: Request) => {
  const { deviceCode } = deviceTokenRequestSchema.parse(await readJson(request));
  await rateLimit(`device-token:${sha256Hex(deviceCode)}`, 60, 600);
  const result = await services().devices.exchange(deviceCode);
  return json(result, result.status === 'approved' ? 200 : 202);
});
