import { describe, expect, it } from 'vitest';
import { emailSchema, paginationSchema, slugSchema } from '../src';

describe('primitives', () => {
  it('normalizes emails', () => {
    expect(emailSchema.parse('Dev@Example.COM')).toBe('dev@example.com');
  });
  it('rejects bad slugs', () => {
    expect(slugSchema.safeParse('Hello World').success).toBe(false);
    expect(slugSchema.safeParse('payments-team').success).toBe(true);
  });
  it('coerces and bounds pagination', () => {
    expect(paginationSchema.parse({ limit: '10' }).limit).toBe(10);
    expect(paginationSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
});
