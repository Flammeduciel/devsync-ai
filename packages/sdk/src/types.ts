/** Response shapes of the REST API used by the Bridge and the MCP server. */
export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export type DeviceTokenResult =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'approved'; deviceToken: string; machineId: string; teamId: string; userId: string };

export interface WhoAmI {
  machine: { id: string; name: string; pairedAt: string };
  user: { id: string; name: string; email: string };
  team: { id: string; name: string; slug: string };
  realtimeUrl: string;
}

export interface RegisteredSession {
  agentId: string;
  sessionId: string;
  projectId: string | null;
}

export interface InboxItem {
  id: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  dueAt: string | null;
  createdAt: string;
  origin: string;
  project: { id: string; name: string };
  createdBy: { id: string; name: string };
  initiatorAgent: { id: string; name: string } | null;
  assigneeAgentId: string | null;
}
