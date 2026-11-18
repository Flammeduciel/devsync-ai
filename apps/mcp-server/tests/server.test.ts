import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { ApiOperation, BridgeClient } from '../src/bridge';
import { createMcpServer } from '../src/server';

const context = {
  team: { id: 't', name: 'Payments Squad', slug: 'payments-squad' },
  project: {
    id: 'p',
    name: 'Checkout',
    description: null,
    access: 'write',
    repositories: [
      { name: 'checkout', remoteUrl: 'github.com/acme/checkout', defaultBranch: 'main' },
    ],
  },
  teammates: [
    {
      agentId: 'a1',
      owner: 'Alice',
      agentName: 'claude-code',
      status: 'WORKING',
      currentTask: 'Payments API contract',
      specialties: ['backend'],
      projects: ['Checkout'],
      branches: ['feat/api'],
    },
  ],
  inbox: [],
  claims: [],
  recentActivity: [
    {
      at: new Date().toISOString(),
      who: 'Alice (claude-code)',
      kind: 'tool_used',
      summary: 'Edited src/api.ts',
      tool: 'Edit',
      project: 'Checkout',
    },
  ],
};

async function connect(bridge: BridgeClient) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer(bridge).connect(serverTransport);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
  return client;
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as { text: string }[])[0]!.text;

describe('DevSync MCP server', () => {
  it('lists the Phase 3 tools with descriptions and schemas', async () => {
    const client = await connect({ api: async () => ({}), call: async () => ({}) } as BridgeClient);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'team_claim_resource',
      'team_find_expert',
      'team_get_activity',
      'team_get_context',
      'team_get_inbox',
      'team_release_resource',
      'team_search_agents',
      'team_set_status',
    ]);
    expect(tools.every((t) => (t.description ?? '').length > 40)).toBe(true);
    expect(tools.find((t) => t.name === 'team_claim_resource')?.inputSchema.required).toEqual([
      'resourceType',
      'resourceKey',
    ]);
  });

  it('formats the team context for the model', async () => {
    const calls: [ApiOperation, unknown][] = [];
    const client = await connect({
      api: async (op: ApiOperation, p: unknown) => (calls.push([op, p]), context),
      call: async () => ({}),
    } as BridgeClient);
    const text = textOf(await client.callTool({ name: 'team_get_context', arguments: {} }));
    expect(text).toContain('Project: **Checkout**');
    expect(text).toContain(
      'Alice (claude-code, working): Payments API contract · Checkout · branch feat/api',
    );
    expect(text).toContain('Edited src/api.ts');
    expect(calls).toEqual([['context', {}]]);
  });

  it('explains a claim conflict with the holder', async () => {
    const conflict = Object.assign(new Error('taken'), {
      status: 409,
      details: {
        claim: {
          id: 'c',
          resourceType: 'FILE',
          resourceKey: 'src/payment.ts',
          reason: 'Refactoring',
          expiresAt: new Date().toISOString(),
          holder: { agentId: 'a1', agentName: 'claude-code', userId: 'u', userName: 'Alice' },
        },
      },
    });
    const client = await connect({
      api: async () => {
        throw conflict;
      },
      call: async () => ({}),
    } as BridgeClient);
    const result = await client.callTool({
      name: 'team_claim_resource',
      arguments: { resourceType: 'FILE', resourceKey: 'src/payment.ts' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("held by Alice's agent");
    expect(textOf(result)).toContain('Coordinate with Alice');
  });

  it('tells the model what to do when the daemon is down', async () => {
    const down = Object.assign(new Error('no daemon'), { unavailable: true });
    const client = await connect({
      api: async () => {
        throw down;
      },
      call: async () => {
        throw down;
      },
    } as BridgeClient);
    const result = await client.callTool({ name: 'team_get_inbox', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('devsync start');
  });

  it('rejects invalid arguments before calling the Bridge', async () => {
    let called = false;
    const client = await connect({
      api: async () => ((called = true), {}),
      call: async () => ({}),
    } as BridgeClient);
    const result = await client.callTool({
      name: 'team_release_resource',
      arguments: { claimId: 'not-a-uuid' },
    });
    expect(result.isError).toBe(true);
    expect(called).toBe(false);
  });
});
