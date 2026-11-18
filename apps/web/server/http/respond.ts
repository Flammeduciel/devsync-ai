import 'server-only';
import { AppError, isAppError } from '@devsync/shared';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { serverEnv } from '../env';
import { logger } from '../infrastructure/logger';

/** Uniform error body for every Route Handler: `{ error: { code, message, details? } }`. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const appError = new AppError('VALIDATION_FAILED', 'Invalid request', error.issues);
    return NextResponse.json({ error: appError.toJSON() }, { status: appError.httpStatus });
  }
  if (isAppError(error)) {
    return NextResponse.json({ error: error.toJSON() }, { status: error.httpStatus });
  }
  logger.error({ err: error }, 'unhandled route error');
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  );
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated mutations: a browser always sends Origin on cross-site
 * POST/PATCH/DELETE, so a foreign Origin is refused. Non-browser clients (Bridge, CLI) send none.
 */
function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(serverEnv().APP_URL).origin) {
    throw new AppError('FORBIDDEN', 'Cross-origin request refused');
  }
}

/** Wraps a Route Handler: origin check, and thrown AppError/ZodError become proper HTTP responses. */
export function handler<Args extends [Request, ...unknown[]] | []>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      if (args[0] instanceof Request) assertSameOrigin(args[0]);
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const json = (data: unknown, status = 200): NextResponse =>
  NextResponse.json(data, { status });
export const noContent = (): Response => new Response(null, { status: 204 });
