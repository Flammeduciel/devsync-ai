import { randomToken, sha256Hex } from '@devsync/shared';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Opaque token sent by email; only its hash is stored. */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomToken(32);
  return { token, tokenHash: hashToken(token) };
}

export const hashToken = sha256Hex;

export function invitationState(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InvitationState {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  if (invitation.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}
