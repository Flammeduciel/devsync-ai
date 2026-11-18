import { searchKnowledgeSchema } from '@devsync/validation';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** Hybrid search: full-text + fuzzy title + semantic (when the embeddings worker runs). */
export const GET = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  const query = readQuery(request);
  const teamId = teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
  const tags = query.tags === undefined ? undefined : ([] as string[]).concat(query.tags);
  return json(await services().knowledge.search(resolved.actor, teamId, searchKnowledgeSchema.parse({ ...query, tags }), resolved.device ?? undefined));
});
