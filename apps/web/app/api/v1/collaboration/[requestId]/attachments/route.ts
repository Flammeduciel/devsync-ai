import { attachmentUploadSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Returns a pre-signed PUT URL bound to the declared content type and size. */
export const POST = handler(async (request: Request, ctx: RouteContext<'/api/v1/collaboration/[requestId]/attachments'>) => {
  const { actor } = await requireActor(request);
  const { requestId } = await ctx.params;
  return json(await services().deliverables.requestAttachmentUpload(actor, pathId(requestId, 'Request'), attachmentUploadSchema.parse(await readJson(request))), 201);
});
