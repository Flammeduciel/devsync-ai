import type { DatabaseClient } from '@devsync/database';
import { sha256Hex, signJwt } from '@devsync/shared';
import { describe, expect, it } from 'vitest';
import { createAuthenticator } from '../src/auth/identity';

const secret = 's'.repeat(40);
const token = 'dsd_' + 'x'.repeat(40);

function stubDb(machine: object | null, member: object | null) {
  return {
    agentMachine: {
      findFirst: async ({ where }: { where: { deviceTokenHash: string } }) =>
        where.deviceTokenHash === sha256Hex(token) ? machine : null,
    },
    teamMember: { findUnique: async () => member },
  } as unknown as DatabaseClient;
}

describe('createAuthenticator', () => {
  it('accepts dashboard JWTs and rejects other kinds or bad signatures', async () => {
    const authenticate = createAuthenticator(stubDb(null, null), secret);
    await expect(
      authenticate(signJwt({ sub: 'u1', kind: 'dashboard', teams: ['t1'] }, secret, 60)),
    ).resolves.toEqual({ kind: 'dashboard', userId: 'u1', teamIds: ['t1'] });
    await expect(
      authenticate(signJwt({ sub: 'u1', kind: 'other', teams: [] }, secret, 60)),
    ).resolves.toBeNull();
    await expect(
      authenticate(signJwt({ sub: 'u1', kind: 'dashboard', teams: [] }, 'w'.repeat(40), 60)),
    ).resolves.toBeNull();
  });

  it('accepts active device tokens whose owner is still a member', async () => {
    const machine = { id: 'm1', userId: 'u1', teamId: 't1' };
    await expect(
      createAuthenticator(stubDb(machine, { id: 'tm' }), secret)(token),
    ).resolves.toEqual({ kind: 'bridge', userId: 'u1', teamIds: ['t1'], machineId: 'm1' });
    await expect(createAuthenticator(stubDb(machine, null), secret)(token)).resolves.toBeNull();
    await expect(
      createAuthenticator(stubDb(null, { id: 'tm' }), secret)(token),
    ).resolves.toBeNull();
  });
});
