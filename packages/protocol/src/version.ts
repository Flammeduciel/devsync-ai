/** Wire protocol version. Bump MAJOR on breaking envelope/handshake changes. */
export const PROTOCOL_VERSION = '1.0';
export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

export function isCompatibleProtocol(clientVersion: string): boolean {
  const [clientMajor] = clientVersion.split('.');
  const [serverMajor] = PROTOCOL_VERSION.split('.');
  return clientMajor === serverMajor;
}
