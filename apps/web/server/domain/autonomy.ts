import type { AutonomyLevel, Priority } from '@devsync/validation';

const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

export interface AutonomyPolicyRules {
  level: AutonomyLevel;
  maxRequestsPerHour: number;
  maxPriority: Priority;
  maxChainDepth: number;
  allowedAgentIds: string[];
  requireApprovalActions: string[];
}

export const DEFAULT_POLICY: AutonomyPolicyRules = {
  level: 'CONTROLLED',
  maxRequestsPerHour: 20,
  maxPriority: 'HIGH',
  maxChainDepth: 3,
  allowedAgentIds: [],
  requireApprovalActions: [],
};

export type AutonomyDecision =
  | { outcome: 'allow' }
  | { outcome: 'needs_approval'; reason: string }
  | { outcome: 'deny'; code: 'RATE_LIMITED' | 'FORBIDDEN' | 'CONFLICT'; reason: string };

/**
 * Decides what happens when an *agent* creates a request (humans are not subject to autonomy rules).
 * Level 1 (SUGGEST): always needs approval. Level 2 (CONTROLLED): allowed within limits, no request
 * chains. Level 3 (COORDINATED): agents may chain requests up to maxChainDepth.
 */
export function evaluateAgentRequest(
  policy: AutonomyPolicyRules,
  request: {
    priority: Priority;
    assigneeAgentId: string | null;
    depth: number;
    createdByAgentLastHour: number;
    /** Agents that initiated the parent chain; the assignee must not be one of them (A → B → A). */
    chainInitiatorAgentIds: string[];
  },
): AutonomyDecision {
  if (request.createdByAgentLastHour >= policy.maxRequestsPerHour) {
    return { outcome: 'deny', code: 'RATE_LIMITED', reason: `Limit of ${policy.maxRequestsPerHour} agent requests per hour reached` };
  }
  if (request.assigneeAgentId && policy.allowedAgentIds.length > 0 && !policy.allowedAgentIds.includes(request.assigneeAgentId)) {
    return { outcome: 'deny', code: 'FORBIDDEN', reason: 'The team policy does not allow agents to solicit this agent' };
  }
  const maxDepth = policy.level === 'COORDINATED' ? policy.maxChainDepth : 0;
  if (request.depth > maxDepth) {
    return { outcome: 'deny', code: 'FORBIDDEN', reason: policy.level === 'COORDINATED' ? `Request chains are limited to ${maxDepth} levels` : 'Agents cannot chain requests at this autonomy level (needs level 3)' };
  }
  if (request.assigneeAgentId && request.chainInitiatorAgentIds.includes(request.assigneeAgentId)) {
    return { outcome: 'deny', code: 'CONFLICT', reason: 'Request loop: this agent is already part of the request chain' };
  }
  if (policy.level === 'SUGGEST') return { outcome: 'needs_approval', reason: 'Autonomy level 1: a developer approves every agent request' };
  if (PRIORITY_RANK[request.priority] > PRIORITY_RANK[policy.maxPriority]) {
    return { outcome: 'needs_approval', reason: `Priority above ${policy.maxPriority} needs a developer's approval` };
  }
  if (policy.requireApprovalActions.includes('request.create')) {
    return { outcome: 'needs_approval', reason: 'The team requires approval for agent requests' };
  }
  return { outcome: 'allow' };
}
