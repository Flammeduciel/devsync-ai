'use server';

import { publishKnowledgeSchema, setValiditySchema, setVisibilitySchema, type PublishKnowledgeInput } from '@devsync/validation';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';

const refresh = () => revalidatePath('/t/[teamSlug]/knowledge', 'layout');

export async function publishKnowledgeAction(input: PublishKnowledgeInput): Promise<ActionResult<{ knowledgeId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const r = await services().knowledge.publish({ type: 'HUMAN', userId: user.id }, publishKnowledgeSchema.parse(input));
    refresh();
    return { knowledgeId: r.knowledgeId };
  });
}

export async function setVisibilityAction(knowledgeId: string, visibility: 'PRIVATE' | 'PROJECT'): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().knowledge.setVisibility({ type: 'HUMAN', userId: user.id }, knowledgeId, setVisibilitySchema.parse({ visibility }));
    refresh();
    return undefined;
  });
}

export async function setValidityAction(knowledgeId: string, validity: 'VALID' | 'OUTDATED' | 'DEPRECATED' | 'DRAFT', reason?: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().knowledge.setValidity({ type: 'HUMAN', userId: user.id }, knowledgeId, setValiditySchema.parse({ validity, ...(reason ? { reason } : {}) }));
    refresh();
    return undefined;
  });
}
