import 'server-only';
import { AppError } from '@devsync/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '../infrastructure/database';
import { auth } from './auth';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** Session of the current request (memoized per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Read the request first: it marks the page as dynamic before any configuration is loaded (build-safe).
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  // Suspension by a platform admin applies immediately, even to existing sessions.
  const account = await db().user.findUnique({ where: { id: session.user.id }, select: { suspendedAt: true, deletedAt: true } });
  if (!account || account.suspendedAt || account.deletedAt) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
});

/** For pages and Server Actions: redirect anonymous visitors to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/** For Route Handlers: 401 instead of a redirect. API keys / device tokens arrive in Phase 2. */
export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return user;
}
