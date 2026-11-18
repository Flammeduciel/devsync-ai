import { describe, expect, it } from 'vitest';
import { ackSchema, envelopeSchema, isCompatibleProtocol, PROTOCOL_VERSION } from '../src';

const base = {
  id: '0190f3a2-7b1c-7d2e-8f00-0123456789ab',
  type: 'agent.status.updated',
  timestamp: '2026-11-18T10:00:00.000Z',
  teamId: '0190f3a2-7b1c-7d2e-8f00-0123456789ac',
  actor: { type: 'AGENT', agentId: '0190f3a2-7b1c-7d2e-8f00-0123456789ad' },
  payload: {},
};

describe('envelope', () => {
  it('accepts a valid envelope and defaults the version', () => {
    expect(envelopeSchema.parse(base).version).toBe(PROTOCOL_VERSION);
  });
  it('rejects malformed event types', () => {
    expect(envelopeSchema.safeParse({ ...base, type: 'AgentStatus' }).success).toBe(false);
  });
  it('validates acks', () => {
    expect(ackSchema.parse({ ok: true, id: base.id })).toMatchObject({ ok: true, duplicate: false });
    expect(ackSchema.safeParse({ ok: false, code: 'X', message: 'y' }).success).toBe(false);
  });
});

describe('isCompatibleProtocol', () => {
  it('compares major versions', () => {
    expect(isCompatibleProtocol('1.7')).toBe(true);
    expect(isCompatibleProtocol('2.0')).toBe(false);
  });
});
