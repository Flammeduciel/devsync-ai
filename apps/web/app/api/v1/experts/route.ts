import { expertQuerySchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json({
    items: await services().directory.findExperts(
      device,
      expertQuerySchema.parse(readQuery(request)),
    ),
  });
});
