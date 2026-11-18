'use server';

import { deviceApproveSchema } from '@devsync/validation';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';

export async function approveDeviceAction(userCode: string, teamId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().devices.approve(user.id, deviceApproveSchema.parse({ userCode, teamId }));
    return undefined;
  });
}

export async function denyDeviceAction(userCode: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().devices.deny(user.id, userCode);
    return undefined;
  });
}

export async function revokeMachineAction(teamId: string, machineId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().devices.revoke(user.id, teamId, machineId);
    revalidatePath('/t/[teamSlug]/agents', 'page');
    return undefined;
  });
}
