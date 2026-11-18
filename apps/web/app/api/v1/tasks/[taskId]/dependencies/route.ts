import { addDependencySchema } from '@devsync/validation';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

const team = (request: Request, resolved: Awaited<ReturnType<typeof requireActor>>) => {
  const query = readQuery(request);
  return teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
};

export const GET = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/tasks/[taskId]/dependencies'>) => {
    const resolved = await requireActor(request);
    const { taskId } = await ctx.params;
    return json(
      await services().tasks.dependencies(resolved.actor, team(request, resolved), {
        taskId: pathId(taskId, 'Task'),
      }),
    );
  },
);

export const POST = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/tasks/[taskId]/dependencies'>) => {
    const resolved = await requireActor(request);
    const { taskId } = await ctx.params;
    return json(
      await services().tasks.addDependency(
        resolved.actor,
        team(request, resolved),
        pathId(taskId, 'Task'),
        addDependencySchema.parse(await readJson(request)),
      ),
      201,
    );
  },
);
