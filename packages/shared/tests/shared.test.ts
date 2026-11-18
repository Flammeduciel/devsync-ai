import { describe, expect, it } from 'vitest';
import { AppError, err, isUuid, newId, ok } from '../src';

describe('newId', () => {
  it('produces valid, unique, time-ordered UUIDv7 strings', () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
  });
});

describe('AppError', () => {
  it('maps codes to HTTP statuses and serializes', () => {
    const e = new AppError('FORBIDDEN', 'nope', { teamId: 't1' });
    expect(e.httpStatus).toBe(403);
    expect(e.toJSON()).toEqual({ code: 'FORBIDDEN', message: 'nope', details: { teamId: 't1' } });
  });
});

describe('Result', () => {
  it('discriminates on ok', () => {
    const r = Math.random() > 2 ? err(new AppError('INTERNAL', 'x')) : ok(42);
    expect(r.ok && r.value).toBe(42);
  });
});
