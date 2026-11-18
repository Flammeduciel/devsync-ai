import { registerSessionSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Bridge: a Claude Code session started (or resumed) on this machine. */
export const POST = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(
    await services().agents.registerSession(
      device,
      registerSessionSchema.parse(await readJson(request)),
    ),
    201,
  );
});
