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
  recentKnowledge?: { id: string; title: string; kind: string; private: boolean; version: number; publishedAt: string }[];
  /** Continuity with this machine's previous conversations (facts only). */
  yourWork?: {
    lastDeclaredTask: { task: string; at: string } | null;
    previousSession: { endedAt: string; branch: string | null; edited: string[] } | null;
    claimsHeld: { id: string; resourceType: string; resourceKey: string; expiresAt: string }[];
    assignedInProgress: { id: string; title: string; status: string }[];
    waitingOnOthers: { id: string; title: string; status: string; assignee: string | null }[];
  } | null;
}

export interface DeliveredItem {
  id: string;
  title: string;
  updatedAt: string;
  project: { id: string; name: string };
  assigneeUser: { name: string } | null;
  deliverables: { id: string; title: string; format: string; currentVersion: number }[];
}

export interface RequestSummary {
  id: string;
  type: string;
  status: string;
  priority: string;
  origin: string;
  title: string;
  description: string;
  instructions: string | null;
  expectedDeliverables: { title: string; format: string; description?: string }[];
  dueAt: string | null;
  project: { id: string; name: string };
  createdBy: { id: string; name: string };
  initiatorAgent: { id: string; name: string } | null;
  assigneeUser: { id: string; name: string } | null;
  assigneeAgent: { id: string; name: string } | null;
  awaitingApproval: boolean;
  yourRoles: string[];
  availableActions: string[];
}

export interface RequestDetail extends RequestSummary {
  history: {
    at: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    by: string;
  }[];
  comments: { id: string; at: string; body: string; author: string }[];
  deliverables: {
    id: string;
    title: string;
    format: string;
    status: string;
    currentVersion: number;
    by: string;
    versions: {
      version: number;
      contentType: string | null;
      url: string | null;
      notes: string | null;
    }[];
  }[];
  tasks: { id: string; title: string; status: string }[];
}

export interface DependencyGraph {
  tasks: { id: string; title: string; status: string; requestId: string | null }[];
  blockedBy: {
    status: string;
    task: { id: string; title: string; status: string; requestId: string | null };
  }[];
  blocking: {
    status: string;
    task: { id: string; title: string; status: string; requestId: string | null };
  }[];
}

export interface DeliverableContent {
  deliverableId: string;
  title: string;
  format: string;
  version: number;
  contentType: string | null;
  downloadUrl: string | null;
  gitRef: { commit: string; branch: string | null; path: string | null } | null;
  url: string | null;
  content: string | null;
}

export interface KnowledgeSearchResult {
  semantic: boolean;
  items: { id: string; title: string; kind: string; validity: string; visibility: string; version: number; project: string; author: string; tags: string[]; summary: string | null; snippet: string | null; score: number; matchedBy: string[]; publishedAt: string }[];
}

export interface KnowledgeListItem {
  id: string;
  title: string;
  kind: string;
  validity: string;
  visibility: string;
  version: number;
  project: string;
  author: string;
  tags: string[];
  readers: number;
  publishedAt: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  kind: string;
  validity: string;
  visibility: string;
  project: { id: string; name: string };
  tags: string[];
  version: number;
  currentVersion: number;
  content: string;
  summary: string | null;
  references: { type: string; ref: string }[];
  author: string;
  versionBy: string;
  publishedAt: string;
  versions: { version: number; at: string; by: string }[];
}
