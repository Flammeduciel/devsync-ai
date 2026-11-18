/** Request bodies (validated server-side with @devsync/validation; kept structural here). */
export interface DeviceAuthInput {
  machineName: string;
  hostname?: string;
  os?: string;
  bridgeVersion: string;
}

export interface SessionBody {
  agentName?: string;
  externalSessionId: string;
  workingDirectory?: string;
  branch?: string;
  projectId?: string;
  repositoryRemote?: string;
  pluginVersion?: string;
  specialties?: string[];
}

export interface HeartbeatBody {
  status?: 'ONLINE' | 'IDLE' | 'WORKING' | 'WAITING' | 'ERROR';
  currentTask?: string | null;
}

export interface ActivityBody {
  id?: string;
  sessionId: string;
  kind: 'tool_used' | 'task_declared' | 'summary_published';
  summary: string;
  tool?: string;
}
