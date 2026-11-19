/** Only same-site relative paths are allowed as post-login destinations (no open redirect). */
export function safeRedirect(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback;
  return value;
}

/** Sign-in page that brings the visitor back to `returnTo` (a same-site path) once signed in. */
export function signInPath(returnTo?: string): string {
  const next = safeRedirect(returnTo, '');
  return next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in';
}
