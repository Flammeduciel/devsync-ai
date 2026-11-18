import { AppError } from '@devsync/shared';
import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readQuery } from '@/server/http/request';
import { handler } from '@/server/http/respond';

/** Browser download: redirects to a short-lived pre-signed URL (or the PR link). */
export const GET = handler(async (request: Request, ctx: RouteContext<'/api/v1/deliverables/[deliverableId]/download'>) => {
  const { actor } = await requireActor(request);
  const { deliverableId } = await ctx.params;
  const query = readQuery(request);
  const version = typeof query.version === 'string' && /^\d+$/.test(query.version) ? Number(query.version) : undefined;
  const d = await services().deliverables.read(actor, pathId(deliverableId, 'Deliverable'), version ? { version } : {});
  const target = d.downloadUrl ?? d.url;
  if (!target) throw new AppError('NOT_FOUND', 'Nothing to download for this deliverable');
  return NextResponse.redirect(target, 302);
});
