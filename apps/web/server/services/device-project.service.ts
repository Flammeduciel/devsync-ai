import { AppError } from '@devsync/shared';
import { normalizeRemoteUrl } from '@devsync/validation';
import { projectAccess, type ProjectAccess } from '../domain/project-access';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import type { DeviceActor } from './devices.service';
import type { ServiceDeps } from './ports';

/**
 * Resolves the project a device is working on: an explicit id, or the project owning the Git remote
 * of the agent's working directory. Only projects of the device's team that its owner can access.
 */
export async function resolveDeviceProject(
  deps: Pick<ServiceDeps, 'db'>,
  device: DeviceActor,
  input: { projectId?: string | undefined; remote?: string | undefined },
): Promise<{ projectId: string; access: Exclude<ProjectAccess, 'none'> } | null> {
  const membership = await membersRepository.find(deps.db, device.teamId, device.userId);
  if (!membership) throw new AppError('UNAUTHENTICATED', 'Device owner is no longer a team member');

  const accessTo = async (id: string): Promise<ProjectAccess> => {
    const project = await projectsRepository.findActiveById(deps.db, id);
    if (!project || project.teamId !== device.teamId) return 'none';
    const member = await projectsRepository.findProjectMember(deps.db, id, device.userId);
    return projectAccess(membership.role, member?.role ?? null);
  };

  if (input.projectId) {
    const access = await accessTo(input.projectId);
    if (access === 'none') throw new AppError('NOT_FOUND', 'Project not found');
    return { projectId: input.projectId, access };
  }
  const normalized = input.remote ? normalizeRemoteUrl(input.remote) : null;
  if (!normalized) return null;
  const repositories = await deps.db.repository.findMany({
    where: { teamId: device.teamId, remoteUrl: normalized, deletedAt: null },
    select: { projectId: true },
  });
  for (const repo of repositories) {
    const access = await accessTo(repo.projectId);
    if (access !== 'none') return { projectId: repo.projectId, access };
  }
  return null;
}
