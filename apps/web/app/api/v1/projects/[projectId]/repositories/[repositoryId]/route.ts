import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, noContent } from '@/server/http/respond';
import { pathId } from '@/server/http/request';

export const DELETE = handler(
  async (
    _request: Request,
    ctx: RouteContext<'/api/v1/projects/[projectId]/repositories/[repositoryId]'>,
  ) => {
    const user = await requireApiUser();
    const { projectId, repositoryId } = await ctx.params;
    await services().projects.removeRepository(
      user.id,
      pathId(projectId, 'Project'),
      pathId(repositoryId, 'Repository'),
    );
    return noContent();
  },
);
