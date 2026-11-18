import { gitSnapshotSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Bridge: read-only snapshot of a worktree → overlaps with other agents and merge-tree checks to run. */
export const POST = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(
    await services().git.reportSnapshot(device, gitSnapshotSchema.parse(await readJson(request))),
  );
});
