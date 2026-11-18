export type SignupMode = 'OPEN' | 'INVITE_ONLY' | 'CLOSED';

/** PLATFORM_ADMIN_EMAILS="a@x.com, b@y.com" → normalized set. */
export function parseAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
  );
}

/**
 * A platform admin is listed in the deployment configuration AND has verified that address: otherwise
 * anyone could sign up first with the admin's email and inherit the console.
 */
export function isPlatformAdmin(
  user: { email: string; emailVerified: boolean } | null,
  adminEmails: Set<string>,
): boolean {
  return !!user && user.emailVerified && adminEmails.has(user.email.toLowerCase());
}

export type SignupDecision = { allowed: true } | { allowed: false; reason: string };

/** Listed platform admins can always create their account (to bootstrap a closed instance). */
export function canSignUp(
  mode: SignupMode,
  email: string,
  context: { adminEmails: Set<string>; hasPendingInvitation: boolean },
): SignupDecision {
  if (context.adminEmails.has(email.toLowerCase())) return { allowed: true };
  if (mode === 'OPEN') return { allowed: true };
  if (mode === 'INVITE_ONLY')
    return context.hasPendingInvitation
      ? { allowed: true }
      : { allowed: false, reason: 'Sign-up is by invitation only on this instance' };
  return { allowed: false, reason: 'Sign-up is closed on this instance' };
}
