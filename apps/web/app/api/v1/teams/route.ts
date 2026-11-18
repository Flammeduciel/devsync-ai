import { createTeamSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { readJson } from '@/server/http/request';

export const GET = handler(async () => {
  const user = await requireApiUser();
  return json({ items: await services().teams.listMine(user.id) });
});

export const POST = handler(async (request: Request) => {
  const user = await requireApiUser();
  return json(
    await services().teams.create(user.id, createTeamSchema.parse(await readJson(request))),
    201,
  );
});
