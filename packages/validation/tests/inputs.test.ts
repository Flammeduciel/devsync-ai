import { describe, expect, it } from 'vitest';
import { createRepositorySchema, detectProvider, normalizeRemoteUrl, resetPasswordSchema, signUpSchema } from '../src';

describe('auth inputs', () => {
  it('enforces password strength', () => {
    expect(signUpSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short1' }).success).toBe(false);
    expect(signUpSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'longenough1' }).success).toBe(true);
  });
  it('checks confirmation', () => {
    expect(resetPasswordSchema.safeParse({ password: 'longenough1', confirm: 'other' }).success).toBe(false);
  });
});

describe('normalizeRemoteUrl', () => {
  it.each([
    ['https://github.com/acme/payments.git', 'github.com/acme/payments'],
    ['git@github.com:acme/payments.git', 'github.com/acme/payments'],
    ['ssh://git@gitlab.com/group/sub/api', 'gitlab.com/group/sub/api'],
    ['https://user:token@GitHub.com/acme/web/', 'github.com/acme/web'],
    ['github.com/acme/payments', 'github.com/acme/payments'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeRemoteUrl(input)).toBe(expected);
  });
  it('rejects junk', () => {
    expect(normalizeRemoteUrl('not a url')).toBeNull();
    expect(normalizeRemoteUrl('localhost')).toBeNull();
    expect(normalizeRemoteUrl('file:///tmp/repo')).toBeNull();
    expect(createRepositorySchema.safeParse({ remoteUrl: 'https://github.com/only' }).success).toBe(false);
  });
  it('detects providers', () => {
    expect(detectProvider('bitbucket.org/a/b')).toBe('BITBUCKET');
    expect(detectProvider('git.example.com/a/b')).toBe('OTHER');
  });
});
