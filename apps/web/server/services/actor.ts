import { AppError } from '@devsync/shared';
import type { Db } from '@devsync/database';
import type { DeviceActor } from './devices.service';

/**
 * Who performs a collaboration action. Agents act with their owner's rights; `agentId` is kept for
 * history, audit and loop prevention.
 */
export type Actor =
  | { type: 'HUMAN'; userId: string }
  | { type: 'AGENT'; userId: string; teamId: string; machineId: string; agentId: string };

export async function agentActor(db: Db, device: DeviceActor, agentName: string): Promise<Actor> {
  const agent = await db.agent.findUnique({ where: { machineId_name: { machineId: device.machineId, name: agentName } }, select: { id: true } });
  if (!agent) throw new AppError('NOT_FOUND', 'No agent registered on this machine; start a Claude Code session first');
  return { type: 'AGENT', userId: device.userId, teamId: device.teamId, machineId: device.machineId, agentId: agent.id };
}

export const actorAgentId = (actor: Actor): string | null => (actor.type === 'AGENT' ? actor.agentId : null);

export const actorRef = (actor: Actor) =>
  actor.type === 'AGENT' ? { type: 'AGENT' as const, userId: actor.userId, agentId: actor.agentId } : { type: 'HUMAN' as const, userId: actor.userId };
