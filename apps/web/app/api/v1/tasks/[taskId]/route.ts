import { updateTaskSchema } from '@devsync/validation';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const PATCH = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/tasks/[taskId]'>) => {
    const resolved = await requireActor(request);
    const { taskId } = await ctx.params;
    const query = readQuery(request);
    const teamId = teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
    return json(
      await services().tasks.updateStatus(
        resolved.actor,
        teamId,
        pathId(taskId, 'Task'),
        updateTaskSchema.parse(await readJson(request)),
      ),
    );
  },
);
