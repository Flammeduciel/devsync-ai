import { describe, expect, it } from 'vitest';
import { createRequestSchema, deliverableVersionSchema, requestActionSchema } from '../src';

const id = '01a1ee8d-715d-7b0d-8f27-918b280a01ce';

describe('collaboration inputs', () => {
  it('requires an assignee and applies defaults', () => {
    expect(createRequestSchema.safeParse({ type: 'WORK', title: 'Payment API', description: 'x' }).success).toBe(false);
    expect(createRequestSchema.parse({ type: 'WORK', title: 'Payment API', description: 'x', assigneeAgentId: id })).toMatchObject({ priority: 'NORMAL', suggestOnly: false, expectedDeliverables: [] });
  });
  it('requires a question to ask for clarification', () => {
    expect(requestActionSchema.safeParse({ action: 'clarify' }).success).toBe(false);
    expect(requestActionSchema.safeParse({ action: 'clarify', comment: 'Which currency?' }).success).toBe(true);
  });
  it('accepts only HTTPS links and real commit hashes', () => {
    expect(deliverableVersionSchema.safeParse({ kind: 'url', url: 'http://x.test/pr/1' }).success).toBe(false);
    expect(deliverableVersionSchema.safeParse({ kind: 'url', url: 'https://github.com/a/b/pull/1' }).success).toBe(true);
    expect(deliverableVersionSchema.safeParse({ kind: 'git_ref', commit: 'main' }).success).toBe(false);
  });
});
