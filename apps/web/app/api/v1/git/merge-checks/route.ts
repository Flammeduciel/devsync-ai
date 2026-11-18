import { mergeCheckSchema } from '@devsync/validation';
import { requireDevice } from '@/server/auth/device';
import { services } from '@/server/container';
import { readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Bridge: result of `git merge-tree` against another agent's branch. */
export const POST = handler(async (request: Request) => {
  const device = await requireDevice(request);
  return json(await services().git.reportMergeCheck(device, mergeCheckSchema.parse(await readJson(request))));
});
