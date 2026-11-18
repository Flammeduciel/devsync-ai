import { describe, expect, it } from 'vitest';
import { heartbeatSchema, publishActivitySchema, registerSessionSchema } from '../src';

describe('agent inputs', () => {
  it('defaults the agent name and normalizes specialties', () => {
    const parsed = registerSessionSchema.parse({
      externalSessionId: 's1',
      specialties: [' Backend '],
    });
    expect(parsed).toMatchObject({ agentName: 'claude-code', specialties: ['backend'] });
  });
  it('does not let agents declare themselves offline', () => {
    expect(heartbeatSchema.safeParse({ status: 'OFFLINE' }).success).toBe(false);
    expect(heartbeatSchema.parse({ status: 'WORKING', currentTask: null })).toEqual({
      status: 'WORKING',
      currentTask: null,
    });
  });
  it('reserves session lifecycle activities to the server', () => {
    const sessionId = '01a1ee8d-715d-7b0d-8f27-918b280a01ce';
    expect(
      publishActivitySchema.safeParse({ sessionId, kind: 'session_started', summary: 'x' }).success,
    ).toBe(false);
    expect(
      publishActivitySchema.safeParse({
        sessionId,
        kind: 'tool_used',
        summary: 'Edited payment.ts',
        tool: 'Edit',
      }).success,
    ).toBe(true);
  });
});
