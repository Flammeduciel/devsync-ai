import { isUniqueViolation } from '@devsync/database';
import { AppError } from '@devsync/shared';
import { claimResourceSchema, type ClaimResourceInput } from '@devsync/validation';
import { normalizeResourceKey } from '../domain/claims';
import { hasProjectAccess } from '../domain/project-access';
import { claimsRepository } from '../repositories/claims.repository';
import { resolveDeviceProject } from './device-project.service';
import type { DeviceActor } from './devices.service';
import { clock, type ServiceDeps } from './ports';

const presentClaim = (claim: Awaited<ReturnType<typeof claimsRepository.listActive>>[number]) => ({
  id: claim.id,
  resourceType: claim.resourceType,
  resourceKey: claim.resourceKey,
  reason: claim.reason,
  expiresAt: claim.expiresAt,
  holder: { agentId: claim.agent.id, agentName: claim.agent.name, userId: claim.agent.user.id, userName: claim.agent.user.name },
});

/**
 * Advisory locks between agents ("I am reworking payment.service.ts"). They never block Git; they let
 * an agent see that someone else is on a resource before starting.
 */
export class ClaimsService {
  constructor(private readonly deps: ServiceDeps) {}

  async claim(device: DeviceActor, rawInput: ClaimResourceInput) {
    const input = claimResourceSchema.parse(rawInput);
    const resolved = await resolveDeviceProject(this.deps, device, { projectId: input.projectId, remote: input.remote });
    if (!resolved) throw new AppError('NOT_FOUND', 'No project matches this repository; pass projectId');
    if (!hasProjectAccess(resolved.access, 'write')) throw new AppError('FORBIDDEN', 'Read-only access to this project');
    const resourceKey = normalizeResourceKey(input.resourceType, input.resourceKey);
    if (!resourceKey) throw new AppError('VALIDATION_FAILED', 'Invalid resource key (use a repository-relative path)');

    const agent = await this.deps.db.agent.findUnique({
      where: { machineId_name: { machineId: device.machineId, name: input.agentName } },
      include: { sessions: { where: { endedAt: null }, select: { id: true }, take: 1, orderBy: { startedAt: 'desc' } } },
    });
    if (!agent) throw new AppError('NOT_FOUND', 'No agent registered on this machine; start a session first');

    const now = clock(this.deps);
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000);
    const { projectId } = resolved;
    try {
      return await this.deps.db.$transaction(async (tx) => {
        await claimsRepository.closeExpired(tx, projectId, input.resourceType, resourceKey, now);
        const existing = await claimsRepository.findActive(tx, projectId, input.resourceType, resourceKey, now);
        if (existing && existing.agent.id !== agent.id) {
          throw new AppError('CONFLICT', `${resourceKey} is claimed by ${existing.agent.user.name}'s agent`, { claim: presentClaim(existing) });
        }
        if (existing) {
          await claimsRepository.extend(tx, existing.id, expiresAt, input.reason);
          return { claimId: existing.id, resourceKey, expiresAt, renewed: true };
        }
        const claim = await claimsRepository.create(tx, {
          teamId: device.teamId,
          projectId,
          agentId: agent.id,
          sessionId: agent.sessions[0]?.id ?? null,
          resourceType: input.resourceType,
          resourceKey,
          reason: input.reason,
          expiresAt,
        });
        return { claimId: claim.id, resourceKey, expiresAt, renewed: false };
      });
    } catch (error) {
      // Two agents racing for the same resource: the partial unique index decides.
      if (isUniqueViolation(error)) throw new AppError('CONFLICT', `${resourceKey} was just claimed by another agent`);
      throw error;
    }
  }

  /** Only the machine whose agent holds the claim can release it. */
  async release(device: DeviceActor, claimId: string) {
    const claim = await claimsRepository.findById(this.deps.db, device.teamId, claimId);
    if (!claim || claim.releasedAt) throw new AppError('NOT_FOUND', 'Claim not found');
    if (claim.agent.machineId !== device.machineId) throw new AppError('FORBIDDEN', 'This claim belongs to another agent');
    await claimsRepository.release(this.deps.db, claimId, clock(this.deps));
  }

  async listActive(projectId: string) {
    return (await claimsRepository.listActive(this.deps.db, projectId, clock(this.deps))).map(presentClaim);
  }
}
