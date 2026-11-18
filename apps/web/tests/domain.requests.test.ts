import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, evaluateAgentRequest } from '../server/domain/autonomy';
import { availableActions, checkTransition, requestFingerprint } from '../server/domain/requests';

describe('request state machine', () => {
  it('lets the assignee drive the work and the creator cancel', () => {
    expect(availableActions('PENDING', ['assignee'], false)).toEqual([
      'accept',
      'reject',
      'start',
      'clarify',
    ]);
    expect(availableActions('IN_PROGRESS', ['assignee'], false)).toEqual(['clarify', 'complete']);
    expect(availableActions('IN_PROGRESS', ['creator'], false)).toEqual(['cancel']);
    expect(availableActions('WAITING_FOR_CLARIFICATION', ['creator'], false)).toEqual([
      'answer',
      'cancel',
    ]);
  });
  it('keeps terminal states closed', () => {
    for (const status of ['DELIVERED', 'REJECTED', 'CANCELLED'] as const) {
      expect(availableActions(status, ['creator', 'assignee', 'manager'], false)).toEqual([]);
    }
  });
  it('blocks the assignee until a suggested request is approved', () => {
    expect(
      checkTransition({
        action: 'accept',
        status: 'PENDING',
        roles: ['assignee'],
        awaitingApproval: true,
      }),
    ).toBe('AWAITING_APPROVAL');
    expect(availableActions('PENDING', ['creator'], true)).toEqual(['approve', 'cancel']);
    expect(
      checkTransition({
        action: 'approve',
        status: 'PENDING',
        roles: ['creator'],
        awaitingApproval: false,
      }),
    ).toBe('ALREADY_APPROVED');
  });
  it('refuses actions by the wrong party', () => {
    expect(
      checkTransition({
        action: 'complete',
        status: 'IN_PROGRESS',
        roles: ['creator'],
        awaitingApproval: false,
      }),
    ).toBe('NOT_ALLOWED');
    expect(
      checkTransition({
        action: 'accept',
        status: 'IN_PROGRESS',
        roles: ['assignee'],
        awaitingApproval: false,
      }),
    ).toBe('INVALID_STATE');
  });
  it('fingerprints requests independently of case and punctuation', () => {
    const base = {
      projectId: 'p',
      type: 'WORK',
      assigneeAgentId: 'a',
      title: 'Payment API contract!',
    };
    expect(requestFingerprint(base)).toBe(
      requestFingerprint({ ...base, title: '  payment api CONTRACT ' }),
    );
    expect(requestFingerprint(base)).not.toBe(
      requestFingerprint({ ...base, assigneeAgentId: 'b' }),
    );
  });
});

describe('autonomy policy', () => {
  const request = {
    priority: 'NORMAL' as const,
    assigneeAgentId: 'b',
    depth: 0,
    createdByAgentLastHour: 0,
    chainInitiatorAgentIds: [],
  };

  it('allows level 2 requests within limits', () => {
    expect(evaluateAgentRequest(DEFAULT_POLICY, request)).toEqual({ outcome: 'allow' });
  });
  it('requires approval at level 1, above max priority, or by team rule', () => {
    expect(evaluateAgentRequest({ ...DEFAULT_POLICY, level: 'SUGGEST' }, request).outcome).toBe(
      'needs_approval',
    );
    expect(evaluateAgentRequest(DEFAULT_POLICY, { ...request, priority: 'URGENT' }).outcome).toBe(
      'needs_approval',
    );
    expect(
      evaluateAgentRequest(
        { ...DEFAULT_POLICY, requireApprovalActions: ['request.create'] },
        request,
      ).outcome,
    ).toBe('needs_approval');
  });
  it('denies rate overflow, disallowed agents, loops and chains below level 3', () => {
    expect(
      evaluateAgentRequest(DEFAULT_POLICY, { ...request, createdByAgentLastHour: 20 }),
    ).toMatchObject({ code: 'RATE_LIMITED' });
    expect(
      evaluateAgentRequest({ ...DEFAULT_POLICY, allowedAgentIds: ['c'] }, request),
    ).toMatchObject({ code: 'FORBIDDEN' });
    expect(
      evaluateAgentRequest(DEFAULT_POLICY, { ...request, chainInitiatorAgentIds: ['b'] }),
    ).toMatchObject({ code: 'CONFLICT' });
    expect(evaluateAgentRequest(DEFAULT_POLICY, { ...request, depth: 1 })).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(
      evaluateAgentRequest({ ...DEFAULT_POLICY, level: 'COORDINATED' }, { ...request, depth: 2 }),
    ).toEqual({ outcome: 'allow' });
    expect(
      evaluateAgentRequest({ ...DEFAULT_POLICY, level: 'COORDINATED' }, { ...request, depth: 4 }),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
});
