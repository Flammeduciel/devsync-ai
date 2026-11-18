import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, noContent } from '@/server/http/respond';
import { pathId } from '@/server/http/request';

export const DELETE = handler(async (_request: Request, ctx: RouteContext<'/api/v1/projects/[projectId]/members/[userId]'>) => {
  const user = await requireApiUser();
  const { projectId, userId } = await ctx.params;
  await services().projects.removeMember(user.id, pathId(projectId, 'Project'), pathId(userId, 'Member'));
  return noContent();
});
