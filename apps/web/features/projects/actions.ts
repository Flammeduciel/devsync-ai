'use server';

import {
  addProjectMemberSchema,
  createProjectSchema,
  createRepositorySchema,
  updateProjectSchema,
  type AddProjectMemberInput,
  type CreateProjectInput,
  type CreateRepositoryInput,
  type UpdateProjectInput,
} from '@devsync/validation';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';

const refresh = () => revalidatePath('/t/[teamSlug]', 'layout');

export async function createProjectAction(teamId: string, input: CreateProjectInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const project = await services().projects.create(user.id, teamId, createProjectSchema.parse(input));
    refresh();
    return { id: project.id };
  });
}

export async function updateProjectAction(projectId: string, input: UpdateProjectInput): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().projects.update(user.id, projectId, updateProjectSchema.parse(input));
    refresh();
    return undefined;
  });
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().projects.remove(user.id, projectId);
    refresh();
    return undefined;
  });
}

export async function addProjectMemberAction(projectId: string, input: AddProjectMemberInput): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().projects.addMember(user.id, projectId, addProjectMemberSchema.parse(input));
    refresh();
    return undefined;
  });
}

export async function removeProjectMemberAction(projectId: string, userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().projects.removeMember(user.id, projectId, userId);
    refresh();
    return undefined;
  });
}

export async function addRepositoryAction(projectId: string, input: CreateRepositoryInput): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().projects.addRepository(user.id, projectId, createRepositorySchema.parse(input));
    refresh();
    return undefined;
  });
}

export async function removeRepositoryAction(projectId: string, repositoryId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().projects.removeRepository(user.id, projectId, repositoryId);
    refresh();
    return undefined;
  });
}
