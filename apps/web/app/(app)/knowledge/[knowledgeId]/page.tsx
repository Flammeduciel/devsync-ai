import { isUuid } from '@devsync/shared';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { db } from '@/server/infrastructure/database';
import { orNotFound } from '@/server/http/page';

/** Team-independent link used in notifications. */
export default async function KnowledgeLink({ params }: PageProps<'/knowledge/[knowledgeId]'>) {
  const { knowledgeId } = await params;
  if (!isUuid(knowledgeId)) notFound();
  const user = await requireUser();
  const k = await orNotFound(services().knowledge.get({ type: 'HUMAN', userId: user.id }, knowledgeId));
  const project = await db().project.findUniqueOrThrow({ where: { id: k.project.id }, select: { team: { select: { slug: true } } } });
  redirect(`/t/${project.team.slug}/knowledge/${knowledgeId}` as never);
}
