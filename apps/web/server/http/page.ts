import 'server-only';
import { isAppError } from '@devsync/shared';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { requireUser } from '../auth/session';
import { services } from '../container';

/** Turns NOT_FOUND domain errors into the Next.js 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}

/** Current user + team for a /t/[teamSlug] page, memoized per request. */
export const loadTeamPage = cache(async (teamSlug: string) => {
  const user = await requireUser();
  const team = await orNotFound(services().teams.getBySlug(user.id, teamSlug));
  return { user, team };
});
