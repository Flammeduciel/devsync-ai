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

export interface ProjectLocator {
  projectId?: string;
  /** Git origin URL of the agent's working directory. */
  remote?: string;
}

export interface ActivityEntry {
  at: string;
  who: string;
  kind: string;
  summary: string;
  tool: string | null;
  project: string | null;
}

export interface Expert {
  agentId: string;
  owner: string;
  agentName: string;
  status: string;
  currentTask: string | null;
  score: number;
  reasons: string[];
}

export interface ClaimInfo {
  id: string;
  resourceType: string;
  resourceKey: string;
  reason: string | null;
  expiresAt: string;
  holder: { agentId: string; agentName: string; userId: string; userName: string };
}

export interface TeamContext {
  team: { id: string; name: string; slug: string };
  project: {
    id: string;
    name: string;
    description: string | null;
    access: string;
    repositories: { name: string; remoteUrl: string; defaultBranch: string }[];
  } | null;
  teammates: {
    agentId: string;
    owner: string;
    agentName: string;
    status: string;
    currentTask: string | null;
    specialties: string[];
    projects: string[];
    branches: string[];
  }[];
  inbox: InboxItem[];
  claims: ClaimInfo[];
  recentActivity: ActivityEntry[];
}
