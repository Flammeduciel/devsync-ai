import { describe, expect, it } from 'vitest';
import { publishKnowledgeSchema, searchKnowledgeSchema } from '../src';

describe('knowledge inputs', () => {
  it('normalizes tags and refuses odd ones', () => {
    expect(
      publishKnowledgeSchema.parse({
        kind: 'DECISION',
        title: 'Use cents',
        content: 'x',
        tags: [' Payments ', 'api/v1'],
      }).tags,
    ).toEqual(['payments', 'api/v1']);
    expect(
      publishKnowledgeSchema.safeParse({
        kind: 'DECISION',
        title: 'Use cents',
        content: 'x',
        tags: ['<script>'],
      }).success,
    ).toBe(false);
  });
  it('defaults search options', () => {
    expect(searchKnowledgeSchema.parse({ query: 'amount format' })).toMatchObject({
      includeOutdated: false,
      limit: 8,
    });
  });
});
