import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridgeClient } from './bridge';
import { createMcpServer } from './server';

// stdio transport: stdout is the protocol channel, logs go to stderr only.
const server = createMcpServer(createBridgeClient());
await server.connect(new StdioServerTransport());
