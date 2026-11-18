import { notificationPreferencesSchema } from '@devsync/validation';
import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { readJson, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

const team = (request: Request, resolved: Awaited<ReturnType<typeof requireActor>>) => {
  const query = readQuery(request);
  return teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
};

export const GET = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  return json({
    items: await services().notifications.preferences(
      resolved.actor.userId,
      team(request, resolved),
    ),
  });
});

export const PUT = handler(async (request: Request) => {
  const resolved = await requireActor(request);
  return json({
    items: await services().notifications.updatePreferences(
      resolved.actor.userId,
      team(request, resolved),
      notificationPreferencesSchema.parse(await readJson(request)),
    ),
  });
});
