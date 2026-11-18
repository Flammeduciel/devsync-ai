'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';
import type { SignupMode } from '@/server/domain/platform';

export async function setUserSuspendedAction(userId: string, suspended: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().platform.setUserSuspended(user.id, userId, suspended);
    revalidatePath('/admin', 'layout');
    return undefined;
  });
}

export async function setTeamSuspendedAction(teamId: string, suspended: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().platform.setTeamSuspended(user.id, teamId, suspended);
    revalidatePath('/admin', 'layout');
    return undefined;
  });
}

export async function setSignupModeAction(mode: SignupMode): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().platform.setSignupMode(user.id, mode);
    revalidatePath('/admin', 'layout');
    return undefined;
  });
}
