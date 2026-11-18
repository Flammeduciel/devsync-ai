import 'server-only';
import { AppError, isAppError } from '@devsync/shared';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
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

/** Wraps a Route Handler so thrown AppError/ZodError become proper HTTP responses. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
