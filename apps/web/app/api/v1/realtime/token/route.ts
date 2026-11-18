import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { serverEnv } from '@/server/env';
import { handler, json } from '@/server/http/respond';

/** Dashboard: short-lived token + URL to open the realtime socket. */
export const GET = handler(async () => {
  const user = await requireApiUser();
  const { token, expiresIn } = await services().realtimeTokens.issue(user.id);
  return json({ token, expiresIn, url: serverEnv().REALTIME_URL });
});
