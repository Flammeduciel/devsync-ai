import { describe, expect, it } from 'vitest';
import { randomToken, safeEqual, sha256Hex, signJwt, verifyJwt } from '../src';

const secret = 'x'.repeat(40);

describe('crypto', () => {
  it('hashes and generates prefixed tokens', () => {
    expect(sha256Hex('a')).toHaveLength(64);
    expect(randomToken(32, 'dsd_')).toMatch(/^dsd_[A-Za-z0-9_-]{43}$/);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('jwt', () => {
  it('round-trips claims', () => {
    const token = signJwt({ sub: 'u1', teams: ['t1'] }, secret, 60);
    expect(verifyJwt(token, secret)).toMatchObject({ sub: 'u1', teams: ['t1'] });
  });
  it('rejects tampering, wrong secret, expiry and alg confusion', () => {
    const token = signJwt({ sub: 'u1' }, secret, 60, 1_000_000);
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: 9e9 })).toString('base64url');
    expect(verifyJwt(`${h}.${forged}.${s}`, secret, 1_000_000)).toBeNull();
    expect(verifyJwt(token, 'y'.repeat(40), 1_000_000)).toBeNull();
    expect(verifyJwt(token, secret, 1_000_000 + 61_000)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyJwt(`${none}.${p}.`, secret, 1_000_000)).toBeNull();
  });
});
