import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId } from '@/server/http/request';
import { handler } from '@/server/http/respond';

/** Redirects to a short-lived pre-signed download URL. */
export const GET = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/attachments/[attachmentId]/download'>) => {
    const { actor } = await requireActor(request);
    const { attachmentId } = await ctx.params;
    const { url } = await services().deliverables.attachmentDownload(
      actor,
      pathId(attachmentId, 'Attachment'),
    );
    return NextResponse.redirect(url, 302);
  },
);
