import { acceptInvitationSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { readJson } from '@/server/http/request';

export const POST = handler(async (request: Request) => {
  const user = await requireApiUser();
  const { token } = acceptInvitationSchema.parse(await readJson(request));
  return json(await services().invitations.accept(user.id, token));
});
