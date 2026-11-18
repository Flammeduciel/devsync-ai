/** A pending `devsync login`, kept for 10 minutes. Never persisted in PostgreSQL. */
export interface DeviceFlowRecord {
  userCode: string;
  machineName: string;
  hostname?: string | undefined;
  os?: string | undefined;
  bridgeVersion: string;
  status: 'pending' | 'approved' | 'denied';
  userId?: string;
  teamId?: string;
  createdAt: string;
}

/** Keyed by the SHA-256 of the device code (the secret held by the Bridge) and by user code. */
export interface DeviceFlowStore {
  create(deviceCodeHash: string, record: DeviceFlowRecord, ttlSeconds: number): Promise<void>;
  getByDeviceCode(deviceCodeHash: string): Promise<DeviceFlowRecord | null>;
  getByUserCode(
    userCode: string,
  ): Promise<{ deviceCodeHash: string; record: DeviceFlowRecord } | null>;
  update(deviceCodeHash: string, record: DeviceFlowRecord): Promise<void>;
  /** Atomically reads and deletes: an approved code can be exchanged only once. */
  take(deviceCodeHash: string): Promise<DeviceFlowRecord | null>;
}

export class MemoryDeviceFlowStore implements DeviceFlowStore {
  private readonly records = new Map<string, { record: DeviceFlowRecord; expiresAt: number }>();

  async create(hash: string, record: DeviceFlowRecord, ttl: number) {
    this.records.set(hash, { record, expiresAt: Date.now() + ttl * 1000 });
  }
  async getByDeviceCode(hash: string) {
    const entry = this.records.get(hash);
    return entry && entry.expiresAt > Date.now() ? entry.record : null;
  }
  async getByUserCode(userCode: string) {
    for (const [deviceCodeHash, entry] of this.records) {
      if (entry.record.userCode === userCode && entry.expiresAt > Date.now())
        return { deviceCodeHash, record: entry.record };
    }
    return null;
  }
  async update(hash: string, record: DeviceFlowRecord) {
    const entry = this.records.get(hash);
    if (entry) entry.record = record;
  }
  async take(hash: string) {
    const record = await this.getByDeviceCode(hash);
    this.records.delete(hash);
    return record;
  }
}
