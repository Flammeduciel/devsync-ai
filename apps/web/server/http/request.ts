import 'server-only';
import { AppError, isUuid } from '@devsync/shared';

const MAX_JSON_BYTES = 1_000_000;

/** Parses a JSON body with a size limit. Validation happens in the service. */
export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_JSON_BYTES) throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected application/json');
  }
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES)
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AppError('BAD_REQUEST', 'Malformed JSON body');
  }
}

/** Path ids that are not UUIDs cannot exist: answer 404 like any other unknown id. */
export function pathId(value: string, resource = 'Resource'): string {
  if (!isUuid(value)) throw new AppError('NOT_FOUND', `${resource} not found`);
  return value;
}
