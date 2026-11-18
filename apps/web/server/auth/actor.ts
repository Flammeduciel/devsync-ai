import 'server-only';
import { AppError } from '@devsync/shared';
import { services } from '../container';
import { db } from '../infrastructure/database';
import { agentActor, type Actor } from '../services/actor';
import type { DeviceActor } from '../services/devices.service';
import { getCurrentUser } from './session';

export const AGENT_HEADER = 'x-devsync-agent';

export type ResolvedActor = { actor: Actor; device: DeviceActor | null };

/**
 * A Bridge (Bearer device token) acts as its agent — named by the X-DevSync-Agent header, default
 * "claude-code"; a browser session acts as the signed-in developer.
 */
export async function requireActor(request: Request): Promise<ResolvedActor> {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    const device = await services().devices.authenticate(header.slice(7).trim());
    if (!device) throw new AppError('UNAUTHENTICATED', 'Invalid or revoked device token');
    const agentName = (request.headers.get(AGENT_HEADER) ?? 'claude-code').slice(0, 100);
    return { actor: await agentActor(db(), device, agentName), device };
  }
  const user = await getCurrentUser();
  if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return { actor: { type: 'HUMAN', userId: user.id }, device: null };
}

/** Team of the caller: the device's team, or an explicit (verified by services) teamId for humans. */
export function teamOf(resolved: ResolvedActor, requested: string | null): string {
  if (resolved.device) return resolved.device.teamId;
  if (!requested) throw new AppError('VALIDATION_FAILED', 'teamId is required');
  return requested;
}
