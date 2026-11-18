import { describe, expect, it } from 'vitest';
import { canSignUp, isPlatformAdmin, parseAdminEmails } from '../server/domain/platform';

describe('platform rules', () => {
  const admins = parseAdminEmails(' Owner@Example.com, ,ops@example.com ');

  it('requires a listed and verified email to be platform admin', () => {
    expect([...admins]).toEqual(['owner@example.com', 'ops@example.com']);
    expect(isPlatformAdmin({ email: 'owner@example.com', emailVerified: true }, admins)).toBe(true);
    expect(isPlatformAdmin({ email: 'owner@example.com', emailVerified: false }, admins)).toBe(false);
    expect(isPlatformAdmin({ email: 'dev@example.com', emailVerified: true }, admins)).toBe(false);
  });

  it('applies the sign-up mode, admins excepted', () => {
    const ctx = { adminEmails: admins, hasPendingInvitation: false };
    expect(canSignUp('OPEN', 'x@y.z', ctx).allowed).toBe(true);
    expect(canSignUp('INVITE_ONLY', 'x@y.z', ctx).allowed).toBe(false);
    expect(canSignUp('INVITE_ONLY', 'x@y.z', { ...ctx, hasPendingInvitation: true }).allowed).toBe(true);
    expect(canSignUp('CLOSED', 'x@y.z', { ...ctx, hasPendingInvitation: true }).allowed).toBe(false);
    expect(canSignUp('CLOSED', 'OWNER@example.com', ctx).allowed).toBe(true);
  });
});
