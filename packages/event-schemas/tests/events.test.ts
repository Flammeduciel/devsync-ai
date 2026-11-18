import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, parseEvent } from '../src';

const env = (type: string, payload: unknown) => ({
  id: '0190f3a2-7b1c-7d2e-8f00-0123456789ab',
  type,
  timestamp: '2026-11-18T10:00:00.000Z',
  teamId: '0190f3a2-7b1c-7d2e-8f00-0123456789ac',
  actor: { type: 'SYSTEM' },
  payload,
});
const uuid = '0190f3a2-7b1c-7d2e-8f00-0123456789ad';

describe('parseEvent', () => {
  it('covers every event listed in the spec', () => {
    expect(EVENT_TYPES).toContain('collaboration.deliverable.ready');
    expect(EVENT_TYPES).toHaveLength(13);
  });

  it('parses a valid typed event', () => {
    const r = parseEvent(env('agent.status.updated', { agentId: uuid, userId: uuid, status: 'WORKING' }));
    expect(r.ok).toBe(true);
    if (r.ok && r.event.type === 'agent.status.updated') expect(r.event.payload.status).toBe('WORKING');
  });

  it('rejects unknown types and bad payloads', () => {
    expect(parseEvent(env('agent.teleported', {}))).toMatchObject({ ok: false, code: 'UNKNOWN_EVENT_TYPE' });
    expect(parseEvent(env('agent.status.updated', { agentId: uuid, userId: uuid, status: 'DREAMING' }))).toMatchObject({
      ok: false,
      code: 'INVALID_PAYLOAD',
    });
    expect(parseEvent({ nope: true })).toMatchObject({ ok: false, code: 'INVALID_ENVELOPE' });
  });
});
