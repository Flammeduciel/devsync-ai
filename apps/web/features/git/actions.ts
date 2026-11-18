'use server';

import { updateConflictSchema } from '@devsync/validation';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';

export async function updateConflictAction(
  conflictId: string,
  status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED',
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().git.updateConflict(
      user.id,
      conflictId,
      updateConflictSchema.parse({ status }),
    );
    revalidatePath('/t/[teamSlug]/git', 'page');
    return undefined;
  });
}
