'use server';

import {
  autonomyPolicyUpdateSchema,
  commentSchema,
  createRequestSchema,
  notificationPreferencesSchema,
  requestActionSchema,
  type AutonomyPolicyUpdate,
  type CreateRequestInput,
  type RequestActionInput,
} from '@devsync/validation';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';

const refresh = () => revalidatePath('/t/[teamSlug]', 'layout');

export async function createRequestAction(
  input: CreateRequestInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const request = await services().requests.create(
      { type: 'HUMAN', userId: user.id },
      createRequestSchema.parse(input),
    );
    refresh();
    return { id: request.id };
  });
}

export async function requestActionAction(
  requestId: string,
  input: RequestActionInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().requests.act(
      { type: 'HUMAN', userId: user.id },
      requestId,
      requestActionSchema.parse(input),
    );
    refresh();
    return undefined;
  });
}

export async function commentAction(requestId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().requests.comment(
      { type: 'HUMAN', userId: user.id },
      requestId,
      commentSchema.parse({ body }),
    );
    refresh();
    return undefined;
  });
}

export async function markNotificationsReadAction(
  teamId: string,
  ids: string[] | 'all',
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().notifications.markRead(user.id, teamId, ids);
    refresh();
    return undefined;
  });
}

export async function updateNotificationPreferencesAction(
  teamId: string,
  input: z.input<typeof notificationPreferencesSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().notifications.updatePreferences(user.id, teamId, input);
    return undefined;
  });
}

export async function updateAutonomyAction(
  teamId: string,
  input: AutonomyPolicyUpdate,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().autonomy.upsert(user.id, teamId, autonomyPolicyUpdateSchema.parse(input));
    refresh();
    return undefined;
  });
}
