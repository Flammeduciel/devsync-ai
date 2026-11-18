import 'server-only';
import { redis } from './redis';

/** Machines whose Bridge currently holds a socket on a gateway (key maintained by apps/realtime). */
export async function connectedMachines(machineIds: string[]): Promise<Set<string>> {
  if (machineIds.length === 0) return new Set();
  const values = await redis().mget(machineIds.map((id) => `presence:machine:${id}`));
  return new Set(machineIds.filter((_, i) => Number(values[i] ?? 0) > 0));
}
