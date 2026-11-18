import 'server-only';
import { AppError } from '@devsync/shared';
import { services } from '../container';
import type { DeviceActor } from '../services/devices.service';

/** Bearer device token (Bridge, MCP server). */
export async function requireDevice(request: Request): Promise<DeviceActor> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const device = token ? await services().devices.authenticate(token) : null;
  if (!device) throw new AppError('UNAUTHENTICATED', 'Invalid or revoked device token');
  return device;
}
