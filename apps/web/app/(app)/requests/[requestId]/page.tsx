import { isUuid } from '@devsync/shared';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { orNotFound } from '@/server/http/page';
import { db } from '@/server/infrastructure/database';

/** Team-independent link used in notifications and emails. */
export default async function RequestLink({ params }: PageProps<'/requests/[requestId]'>) {
  const { requestId } = await params;
  if (!isUuid(requestId)) notFound();
  const user = await requireUser();
  const r = await orNotFound(
    services().requests.get({ type: 'HUMAN', userId: user.id }, requestId),
  );
  const team = await db().project.findUniqueOrThrow({
    where: { id: r.project.id },
    select: { team: { select: { slug: true } } },
  });
  redirect(`/t/${team.team.slug}/requests/${requestId}` as never);
}
