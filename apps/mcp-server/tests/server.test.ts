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
  it('lists every team tool with descriptions and schemas', async () => {
    const client = await connect({ api: async () => ({}), call: async () => ({}) } as BridgeClient);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'team_ask_agent',
      'team_broadcast',
      'team_claim_resource',
      'team_create_request',
      'team_find_expert',
      'team_get_activity',
      'team_get_context',
      'team_get_dependencies',
      'team_get_inbox',
      'team_get_knowledge',
      'team_get_request',
      'team_list_my_knowledge',
      'team_promote_deliverable',
      'team_publish_deliverable',
      'team_publish_knowledge',
      'team_read_deliverable',
      'team_release_resource',
      'team_request_clarification',
      'team_search_agents',
      'team_search_knowledge',
      'team_set_knowledge_validity',
      'team_set_knowledge_visibility',
      'team_set_status',
      'team_submit_deliverable',
      'team_suggest_collaboration',
      'team_update_request',
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
    expect(text).not.toContain('Resume your work');
    expect(calls).toEqual([['context', {}]]);

    const resumed = await connect({
      api: async () => ({
        ...context,
        yourWork: {
          lastDeclaredTask: { task: 'Cart totals', at: new Date().toISOString() },
          previousSession: null,
          claimsHeld: [
            {
              id: 'c1',
              resourceType: 'FILE',
              resourceKey: 'src/cart.ts',
              expiresAt: new Date().toISOString(),
            },
          ],
          assignedInProgress: [],
          waitingOnOthers: [],
        },
      }),
      call: async () => ({}),
    } as unknown as BridgeClient);
    const resumedText = textOf(await resumed.callTool({ name: 'team_get_context', arguments: {} }));
    expect(resumedText).toContain('## Resume your work');
    expect(resumedText).toContain('Last declared task (just now): Cart totals');
    expect(resumedText).toContain('You still hold file `src/cart.ts`');
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

  it('creates requests, reports approval holds and duplicates', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const summary = {
      id: 'r1',
      status: 'PENDING',
      awaitingApproval: false,
      createdBy: { name: 'Bob' },
      assigneeUser: { name: 'Alice' },
      assigneeAgent: { name: 'claude-code' },
      availableActions: [],
    };
    const client = await connect({
      api: async (op: string, p: Record<string, unknown>) => (calls.push([op, p]), summary),
      call: async () => ({}),
    } as unknown as BridgeClient);
    const sent = textOf(
      await client.callTool({
        name: 'team_create_request',
        arguments: {
          type: 'WORK',
          title: 'Payment API contract',
          description: 'Need POST /payments',
          assigneeAgentId: '01a1ee8d-715d-7b0d-8f27-918b280a01ce',
        },
      }),
    );
    expect(sent).toContain("sent to Alice's agent");
    await client.callTool({
      name: 'team_suggest_collaboration',
      arguments: {
        type: 'REVIEW',
        title: 'Review webhook',
        description: 'x',
        assigneeUserId: '01a1ee8d-715d-7b0d-8f27-918b280a01ce',
      },
    });
    expect(calls[1]![1]).toMatchObject({ suggestOnly: true });

    const duplicate = Object.assign(new Error('The same request is already open'), {
      status: 409,
      details: { requestId: 'r0' },
    });
    const dupClient = await connect({
      api: async () => {
        throw duplicate;
      },
      call: async () => ({}),
    } as BridgeClient);
    const dup = await dupClient.callTool({
      name: 'team_create_request',
      arguments: {
        type: 'WORK',
        title: 'Payment API contract',
        description: 'x',
        assigneeUserId: '01a1ee8d-715d-7b0d-8f27-918b280a01ce',
      },
    });
    expect(textOf(dup)).toContain('Existing request: r0');
  });

  it('submits inline content, then tells the agent to publish', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const client = await connect({
      api: async (op: string, p: Record<string, unknown>) => (
        calls.push([op, p]),
        op === 'createDeliverable' ? { id: 'd1' } : { version: 1 }
      ),
      call: async () => ({}),
    } as unknown as BridgeClient);
    const result = textOf(
      await client.callTool({
        name: 'team_submit_deliverable',
        arguments: {
          requestId: '01a1ee8d-715d-7b0d-8f27-918b280a01ce',
          title: 'Payments OpenAPI',
          format: 'OPENAPI',
          content: 'openapi: 3.1.0',
        },
      }),
    );
    expect(calls.map((c) => c[0])).toEqual(['createDeliverable', 'addDeliverableVersion']);
    expect(calls[1]![1]).toMatchObject({ deliverableId: 'd1', kind: 'inline' });
    expect(result).toContain('team_publish_deliverable');
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
