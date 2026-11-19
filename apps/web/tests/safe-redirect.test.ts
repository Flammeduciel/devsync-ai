import { describe, expect, it } from 'vitest';
import { safeRedirect, signInPath } from '../lib/safe-redirect';

describe('safeRedirect', () => {
  it('keeps relative paths and rejects external ones', () => {
    expect(safeRedirect('/invitations/abc')).toBe('/invitations/abc');
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('/\\evil.com')).toBe('/');
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect(undefined, '/home')).toBe('/home');
  });
});

describe('signInPath', () => {
  it('carries the return path, query string included', () => {
    expect(signInPath('/device?code=C9DH-YUZ7')).toBe('/sign-in?next=%2Fdevice%3Fcode%3DC9DH-YUZ7');
    expect(
      safeRedirect(
        new URLSearchParams(signInPath('/device?code=AB&x=1').split('?')[1]).get('next'),
      ),
    ).toBe('/device?code=AB&x=1');
  });

  it('falls back to the plain sign-in page without a safe return path', () => {
    expect(signInPath()).toBe('/sign-in');
    expect(signInPath('https://evil.com')).toBe('/sign-in');
    expect(signInPath('//evil.com')).toBe('/sign-in');
  });
});
