import { describe, expect, it } from 'vitest';
import { normalizeResourceKey } from '../server/domain/claims';
import { scoreExpert, topicTokens } from '../server/domain/experts';

describe('experts', () => {
  it('extracts meaningful tokens', () => {
    expect(topicTokens('API de paiement / Stripe webhooks')).toEqual([
      'paiement',
      'stripe',
      'webhooks',
    ]);
  });
  it('ranks specialties above current task above history, with reasons', () => {
    const tokens = topicTokens('payments webhook');
    const specialist = scoreExpert(tokens, {
      specialties: ['payments'],
      currentTask: null,
      recentSummaries: [],
    });
    const busy = scoreExpert(tokens, {
      specialties: [],
      currentTask: 'Fix payments webhook retries',
      recentSummaries: [],
    });
    const historian = scoreExpert(tokens, {
      specialties: [],
      currentTask: null,
      recentSummaries: ['Edited webhook.ts', 'Edited payments.ts', 'x'],
    });
    expect(busy.score).toBeGreaterThan(specialist.score);
    expect(specialist.score).toBeGreaterThan(historian.score);
    expect(historian.reasons).toEqual(['2 recent related activities']);
    expect(
      scoreExpert(tokens, { specialties: ['frontend'], currentTask: null, recentSummaries: [] })
        .score,
    ).toBe(0);
  });
});

describe('normalizeResourceKey', () => {
  it('canonicalizes paths and refuses escapes', () => {
    expect(normalizeResourceKey('FILE', './src//payment.service.ts')).toBe(
      'src/payment.service.ts',
    );
    expect(normalizeResourceKey('DIRECTORY', 'src\\payments')).toBe('src/payments/');
    expect(normalizeResourceKey('FILE', '../etc/passwd')).toBeNull();
    expect(normalizeResourceKey('FILE', '/etc/passwd')).toBeNull();
    expect(normalizeResourceKey('API_CONTRACT', '  POST   /Payments ')).toBe('post /payments');
  });
});
