import { setValiditySchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const PATCH = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/knowledge/[knowledgeId]/validity'>) => {
    const { actor } = await requireActor(request);
    const { knowledgeId } = await ctx.params;
    return json(
      await services().knowledge.setValidity(
        actor,
        pathId(knowledgeId, 'Knowledge'),
        setValiditySchema.parse(await readJson(request)),
      ),
    );
  },
);
