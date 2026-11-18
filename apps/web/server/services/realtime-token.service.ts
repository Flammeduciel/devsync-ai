import { signJwt } from '@devsync/shared';
import { teamsRepository } from '../repositories/teams.repository';
import type { ServiceDeps } from './ports';

export const REALTIME_TOKEN_TTL_SECONDS = 300;

export interface RealtimeClaims extends Record<string, unknown> {
  sub: string;
  kind: 'dashboard';
  teams: string[];
}

/** Short-lived token the dashboard uses to open its socket. Team list is fixed at issue time. */
export class RealtimeTokenService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly secret: string,
  ) {}

  async issue(userId: string) {
    const memberships = await teamsRepository.listForUser(this.deps.db, userId);
    const claims: RealtimeClaims = {
      sub: userId,
      kind: 'dashboard',
      teams: memberships.map((m) => m.teamId),
    };
    return {
      token: signJwt(claims, this.secret, REALTIME_TOKEN_TTL_SECONDS),
      expiresIn: REALTIME_TOKEN_TTL_SECONDS,
    };
  }
}
