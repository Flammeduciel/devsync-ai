import { createRepositorySchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/projects/[projectId]/repositories'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  return json({ items: await services().projects.listRepositories(user.id, pathId(projectId, 'Project')) });
});

export const POST = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  return json(await services().projects.addRepository(user.id, pathId(projectId, 'Project'), createRepositorySchema.parse(await readJson(request))), 201);
});
