import { describe, expect, it } from 'vitest';
import { aggregateAgentStatus } from '../server/domain/agent-status';
import { generateUserCode, normalizeUserCode } from '../server/domain/devices';

describe('device user codes', () => {
  it('generates readable codes that normalize to themselves', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUserCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
      expect(normalizeUserCode(code.toLowerCase().replace('-', ' '))).toBe(code);
    }
  });
  it('rejects malformed codes', () => {
    expect(normalizeUserCode('ABCD-EFG')).toBeNull();
    expect(normalizeUserCode('ABCD-EFG0')).toBeNull();
  });
});

describe('aggregateAgentStatus', () => {
  it('is offline without sessions and keeps the most significant state', () => {
    expect(aggregateAgentStatus([])).toBe('OFFLINE');
    expect(aggregateAgentStatus(['IDLE', 'WORKING', 'ONLINE'])).toBe('WORKING');
    expect(aggregateAgentStatus(['WORKING', 'ERROR'])).toBe('ERROR');
  });
});
