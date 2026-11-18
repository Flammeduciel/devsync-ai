import type { DatabaseClient } from '@devsync/database';
import { sha256Hex, verifyJwt } from '@devsync/shared';

export type Identity =
  | { kind: 'dashboard'; userId: string; teamIds: string[] }
  | { kind: 'bridge'; userId: string; teamIds: [string]; machineId: string };

export type Authenticate = (token: string) => Promise<Identity | null>;

/**
 * Device tokens (`dsd_…`) are checked against PostgreSQL (revocation is immediate);
 * dashboard tokens are 5-minute HS256 JWTs issued by the web app.
 */
export function createAuthenticator(db: DatabaseClient, jwtSecret: string): Authenticate {
  return async (token) => {
    if (token.startsWith('dsd_')) {
      const machine = await db.agentMachine.findFirst({
        where: { deviceTokenHash: sha256Hex(token), revokedAt: null, team: { deletedAt: null }, user: { deletedAt: null } },
        select: { id: true, userId: true, teamId: true },
      });
      if (!machine) return null;
      const member = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId: machine.teamId, userId: machine.userId } },
        select: { id: true },
      });
      return member ? { kind: 'bridge', userId: machine.userId, teamIds: [machine.teamId], machineId: machine.id } : null;
    }
    const claims = verifyJwt<{ sub?: unknown; kind?: unknown; teams?: unknown }>(token, jwtSecret);
    if (!claims || claims.kind !== 'dashboard' || typeof claims.sub !== 'string' || !Array.isArray(claims.teams)) return null;
    return { kind: 'dashboard', userId: claims.sub, teamIds: claims.teams.filter((t): t is string => typeof t === 'string') };
  };
}
