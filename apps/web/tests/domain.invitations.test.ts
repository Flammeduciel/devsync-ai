import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashToken, invitationState } from '../server/domain/invitations';
import { slugify } from '../server/domain/slug';

describe('invitations', () => {
  it('stores only a hash of a high-entropy token', () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).not.toContain(token);
  });
  it('derives the state', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    const future = new Date('2026-11-20T00:00:00Z');
    const past = new Date('2026-11-17T00:00:00Z');
    expect(invitationState({ acceptedAt: null, revokedAt: null, expiresAt: future }, now)).toBe('pending');
    expect(invitationState({ acceptedAt: null, revokedAt: null, expiresAt: past }, now)).toBe('expired');
    expect(invitationState({ acceptedAt: null, revokedAt: now, expiresAt: future }, now)).toBe('revoked');
    expect(invitationState({ acceptedAt: now, revokedAt: null, expiresAt: past }, now)).toBe('accepted');
  });
});

describe('slugify', () => {
  it('normalizes names', () => {
    expect(slugify('Équipe Paiements — Backend!')).toBe('equipe-paiements-backend');
    expect(slugify('A')).toMatch(/^a-[a-z0-9]{1,4}$/);
  });
});
