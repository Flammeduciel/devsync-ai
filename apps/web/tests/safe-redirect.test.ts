import { describe, expect, it } from 'vitest';
import { safeRedirect } from '../lib/safe-redirect';

describe('safeRedirect', () => {
  it('keeps relative paths and rejects external ones', () => {
    expect(safeRedirect('/invitations/abc')).toBe('/invitations/abc');
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('/\\evil.com')).toBe('/');
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect(undefined, '/home')).toBe('/home');
  });
});
