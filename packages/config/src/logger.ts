import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

const REDACTED_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'authorization',
  'headers.authorization',
  'headers.cookie',
  '*.secret',
  '*.apiKey',
];

/** Structured JSON logger shared by every service. Secrets are redacted by path. */
export function createLogger(service: string, options: LoggerOptions = {}): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    ...options,
  });
}
