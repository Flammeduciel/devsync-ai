import { handshakeSchema, isCompatibleProtocol, PROTOCOL_VERSION, type Handshake } from '@devsync/protocol';
import { AppError } from '@devsync/shared';

/**
 * Validates the shape and protocol version of a Socket.IO handshake.
 * Token verification (realtime JWT / device token) is layered on top in Phase 2.
 */
export function parseHandshake(raw: unknown): Handshake {
  const parsed = handshakeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', 'Invalid handshake', parsed.error.issues);
  }
  if (!isCompatibleProtocol(parsed.data.protocolVersion)) {
    throw new AppError(
      'BAD_REQUEST',
      `Unsupported protocol version ${parsed.data.protocolVersion} (server ${PROTOCOL_VERSION})`,
    );
  }
  return parsed.data;
}
