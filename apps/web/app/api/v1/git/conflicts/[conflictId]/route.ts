import { updateConflictSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** acknowledge | resolve | dismiss an overlap alert (developers involved or project maintainers). */
export const PATCH = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/git/conflicts/[conflictId]'>) => {
    const { actor } = await requireActor(request);
    const { conflictId } = await ctx.params;
    return json(
      await services().git.updateConflict(
        actor.userId,
        pathId(conflictId, 'Conflict'),
        updateConflictSchema.parse(await readJson(request)),
      ),
    );
  },
);
