import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';

/** Team-independent link used in notifications: first team of the user. */
export default async function GitLink() {
  const user = await requireUser();
  const [team] = await services().teams.listMine(user.id);
  redirect(team ? (`/t/${team.slug}/git` as never) : '/onboarding');
}
