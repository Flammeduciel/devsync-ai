import { describe, expect, it } from 'vitest';
import { actionLabel, roleLabel, timeAgo } from '../lib/format';

describe('format', () => {
  it('formats relative times', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(timeAgo(new Date('2026-11-18T11:59:30Z'), now)).toBe('just now');
    expect(timeAgo(new Date('2026-11-18T11:55:00Z'), now)).toBe('5 minutes ago');
    expect(timeAgo(new Date('2026-11-17T12:00:00Z'), now)).toBe('yesterday');
  });
  it('humanizes labels', () => {
    expect(roleLabel('DEVELOPER')).toBe('Developer');
    expect(actionLabel('project.member_set')).toBe('Project member set');
  });
});
