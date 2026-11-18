import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { commonEnv, databaseEnv, loadEnv } from '../src/env';

const schema = z.object({ ...commonEnv, ...databaseEnv });

describe('loadEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    const env = loadEnv(schema, { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('lists every invalid variable', () => {
    expect(() => loadEnv(schema, { DATABASE_URL: 'mysql://x', NODE_ENV: 'staging' })).toThrow(
      /DATABASE_URL[\s\S]*NODE_ENV|NODE_ENV[\s\S]*DATABASE_URL/,
    );
  });
});
