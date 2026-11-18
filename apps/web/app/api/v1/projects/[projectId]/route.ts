import { updateProjectSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json, noContent } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/projects/[projectId]'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  return json(await services().projects.get(user.id, pathId(projectId, 'Project')));
});

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  return json(
    await services().projects.update(
      user.id,
      pathId(projectId, 'Project'),
      updateProjectSchema.parse(await readJson(request)),
    ),
  );
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  await services().projects.remove(user.id, pathId(projectId, 'Project'));
  return noContent();
});
