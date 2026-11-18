import { addProjectMemberSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/projects/[projectId]/members'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  return json({ items: await services().projects.listMembers(user.id, pathId(projectId, 'Project')) });
});

export const POST = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { projectId } = await ctx.params;
  return json(await services().projects.addMember(user.id, pathId(projectId, 'Project'), addProjectMemberSchema.parse(await readJson(request))), 201);
});
