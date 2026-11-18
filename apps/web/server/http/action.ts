import 'server-only';
import { isAppError } from '@devsync/shared';
import { ZodError } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { logger } from '../infrastructure/logger';

/** Runs a Server Action body and converts domain/validation errors into an ActionResult. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors = Object.fromEntries(error.issues.map((i) => [i.path.join('.'), i.message]));
      return { ok: false, code: 'VALIDATION_FAILED', error: 'Please fix the highlighted fields', fieldErrors };
    }
    if (isAppError(error)) return { ok: false, code: error.code, error: error.message };
    // Next.js control-flow errors (redirect, notFound) must propagate.
    if (error instanceof Error && 'digest' in error) throw error;
    logger.error({ err: error }, 'unhandled server action error');
    return { ok: false, code: 'INTERNAL', error: 'Something went wrong' };
  }
}
