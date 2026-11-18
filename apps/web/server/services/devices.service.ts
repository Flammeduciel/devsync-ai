import { AppError, randomToken, sha256Hex } from '@devsync/shared';
import { deviceApproveSchema, deviceAuthorizeSchema, type DeviceApproveInput, type DeviceAuthorizeInput } from '@devsync/validation';
import { DEVICE_CODE_TTL_SECONDS, DEVICE_POLL_INTERVAL_SECONDS, generateUserCode, normalizeUserCode } from '../domain/devices';
import { hasTeamPermission } from '../domain/permissions';
import { recordAudit } from '../repositories/audit.repository';
import { machinesRepository } from '../repositories/machines.repository';
import { membersRepository } from '../repositories/members.repository';
import { requireTeamMember } from './access.service';
import type { DeviceFlowStore } from './device-flow-store';
import { clock, type ServiceDeps } from './ports';

/** Identity of a Bridge authenticated by its device token. */
export interface DeviceActor {
  machineId: string;
  userId: string;
  teamId: string;
}

export type DeviceTokenExchange =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'approved'; deviceToken: string; machineId: string; teamId: string; userId: string };

const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * Device authorization grant (RFC 8628 style) for `devsync login`, device tokens and revocation.
 * Raw device codes and device tokens never touch the database: only their SHA-256.
 */
export class DevicesService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly store: DeviceFlowStore,
    private readonly onRevoked: (machine: { machineId: string; teamId: string }) => Promise<void> = async () => {},
    private readonly presence: (machineIds: string[]) => Promise<Set<string>> = async () => new Set(),
  ) {}

  async authorize(rawInput: DeviceAuthorizeInput) {
    const input = deviceAuthorizeSchema.parse(rawInput);
    const deviceCode = randomToken(32);
    let userCode = generateUserCode();
    while (await this.store.getByUserCode(userCode)) userCode = generateUserCode();
    await this.store.create(
      sha256Hex(deviceCode),
      { ...input, userCode, status: 'pending', createdAt: clock(this.deps).toISOString() },
      DEVICE_CODE_TTL_SECONDS,
    );
    const verificationUri = `${this.deps.appUrl}/device`;
    return {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
      expiresIn: DEVICE_CODE_TTL_SECONDS,
      interval: DEVICE_POLL_INTERVAL_SECONDS,
    };
  }

  /** What the approval page shows. Codes are not secret on their own: approval requires a session. */
  async describe(userCodeInput: string) {
    const userCode = normalizeUserCode(userCodeInput);
    const found = userCode ? await this.store.getByUserCode(userCode) : null;
    if (!found || found.record.status !== 'pending') throw new AppError('NOT_FOUND', 'This code is invalid or has expired');
    const { machineName, hostname, os, bridgeVersion, createdAt } = found.record;
    return { userCode: found.record.userCode, machineName, hostname, os, bridgeVersion, createdAt };
  }

  /** Viewers cannot pair agents: an agent acts with its owner's write rights. */
  async approve(userId: string, rawInput: DeviceApproveInput) {
    const input = deviceApproveSchema.parse(rawInput);
    const { role } = await requireTeamMember(this.deps.db, userId, input.teamId);
    if (!hasTeamPermission(role, 'project:create')) {
      throw new AppError('FORBIDDEN', 'Viewers cannot connect agents to a team');
    }
    const found = await this.findPending(input.userCode);
    await this.store.update(found.deviceCodeHash, { ...found.record, status: 'approved', userId, teamId: input.teamId });
  }

  async deny(userId: string, userCodeInput: string) {
    const found = await this.findPending(userCodeInput);
    await this.store.update(found.deviceCodeHash, { ...found.record, status: 'denied', userId });
  }

  /** Polled by the Bridge. On approval the machine is created and the token returned exactly once. */
  async exchange(deviceCode: string): Promise<DeviceTokenExchange> {
    const hash = sha256Hex(deviceCode);
    const record = await this.store.getByDeviceCode(hash);
    if (!record) throw new AppError('NOT_FOUND', 'This device code is invalid or has expired');
    if (record.status === 'pending') return { status: 'pending' };
    const taken = await this.store.take(hash);
    if (!taken) throw new AppError('NOT_FOUND', 'This device code is invalid or has expired');
    if (taken.status === 'denied') return { status: 'denied' };

    const { userId, teamId } = taken as Required<Pick<typeof taken, 'userId' | 'teamId'>> & typeof taken;
    const deviceToken = randomToken(32, 'dsd_');
    const machine = await this.deps.db.$transaction(async (tx) => {
      const created = await machinesRepository.create(tx, {
        teamId,
        userId,
        name: taken.machineName,
        hostname: taken.hostname,
        os: taken.os,
        bridgeVersion: taken.bridgeVersion,
        deviceTokenHash: sha256Hex(deviceToken),
      });
      await recordAudit(tx, { teamId, actorUserId: userId, action: 'machine.paired', targetType: 'machine', targetId: created.id, metadata: { name: taken.machineName } });
      return created;
    });
    return { status: 'approved', deviceToken, machineId: machine.id, teamId, userId };
  }

  /** Bearer authentication of a Bridge. Removed members and revoked machines are rejected. */
  async authenticate(deviceToken: string): Promise<DeviceActor | null> {
    if (!deviceToken.startsWith('dsd_')) return null;
    const machine = await machinesRepository.findActiveByTokenHash(this.deps.db, sha256Hex(deviceToken));
    if (!machine) return null;
    const membership = await membersRepository.find(this.deps.db, machine.teamId, machine.userId);
    if (!membership) return null;
    const now = clock(this.deps);
    if (!machine.lastSeenAt || now.getTime() - machine.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      await machinesRepository.touch(this.deps.db, machine.id, now);
    }
    return { machineId: machine.id, userId: machine.userId, teamId: machine.teamId };
  }

  /** `devsync status`: who this device token belongs to. */
  async whoami(device: DeviceActor) {
    const machine = await this.deps.db.agentMachine.findUniqueOrThrow({
      where: { id: device.machineId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true, slug: true } },
      },
    });
    return { machine: { id: machine.id, name: machine.name, pairedAt: machine.createdAt }, user: machine.user, team: machine.team };
  }

  /** Developers see their machines; owners/admins see every machine of the team. */
  async list(userId: string, teamId: string) {
    const { role } = await requireTeamMember(this.deps.db, userId, teamId);
    const all = hasTeamPermission(role, 'member:remove');
    const machines = await machinesRepository.list(this.deps.db, teamId, all ? {} : { userId });
    const connected = await this.presence(machines.map((m) => m.id));
    return machines.map(({ deviceTokenHash: _hash, ...machine }) => ({ ...machine, connected: connected.has(machine.id) }));
  }

  async revoke(userId: string, teamId: string, machineId: string) {
    const { role } = await requireTeamMember(this.deps.db, userId, teamId);
    const machine = await machinesRepository.findById(this.deps.db, teamId, machineId);
    if (!machine || machine.revokedAt) throw new AppError('NOT_FOUND', 'Machine not found');
    if (machine.userId !== userId && !hasTeamPermission(role, 'member:remove')) {
      throw new AppError('FORBIDDEN', 'You can only revoke your own machines');
    }
    await this.deps.db.$transaction(async (tx) => {
      await machinesRepository.revoke(tx, machineId, clock(this.deps));
      await recordAudit(tx, { teamId, actorUserId: userId, action: 'machine.revoked', targetType: 'machine', targetId: machineId });
    });
    await this.onRevoked({ machineId, teamId });
  }

  private async findPending(userCodeInput: string) {
    const userCode = normalizeUserCode(userCodeInput);
    const found = userCode ? await this.store.getByUserCode(userCode) : null;
    if (!found || found.record.status !== 'pending') throw new AppError('NOT_FOUND', 'This code is invalid or has expired');
    return found;
  }
}
