import 'server-only';
import type { DeviceFlowRecord, DeviceFlowStore } from '../services/device-flow-store';
import { redis } from './redis';

const dcKey = (hash: string) => `device:dc:${hash}`;
const ucKey = (userCode: string) => `device:uc:${userCode}`;

export const redisDeviceFlowStore: DeviceFlowStore = {
  async create(hash, record, ttl) {
    await redis()
      .multi()
      .set(dcKey(hash), JSON.stringify(record), 'EX', ttl)
      .set(ucKey(record.userCode), hash, 'EX', ttl)
      .exec();
  },
  async getByDeviceCode(hash) {
    const raw = await redis().get(dcKey(hash));
    return raw ? (JSON.parse(raw) as DeviceFlowRecord) : null;
  },
  async getByUserCode(userCode) {
    const hash = await redis().get(ucKey(userCode));
    if (!hash) return null;
    const record = await this.getByDeviceCode(hash);
    return record ? { deviceCodeHash: hash, record } : null;
  },
  async update(hash, record) {
    // KEEPTTL: approval must not extend the 10-minute window.
    await redis().set(dcKey(hash), JSON.stringify(record), 'KEEPTTL', 'XX');
  },
  async take(hash) {
    const raw = await redis().getdel(dcKey(hash));
    if (!raw) return null;
    const record = JSON.parse(raw) as DeviceFlowRecord;
    await redis().del(ucKey(record.userCode));
    return record;
  },
};
