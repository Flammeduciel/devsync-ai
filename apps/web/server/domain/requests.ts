import { createHash } from 'node:crypto';
import type { RequestStatus } from '@devsync/validation';

export const REQUEST_ACTIONS = [
  'approve',
  'accept',
  'reject',
  'start',
  'clarify',
  'answer',
  'complete',
  'cancel',
] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

/** Role of the actor towards a request. Agents act with their owner's role. */
export type RequestRole = 'creator' | 'assignee' | 'manager';

export const OPEN_STATUSES: RequestStatus[] = [
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'WAITING_FOR_CLARIFICATION',
];
export const TERMINAL_STATUSES: RequestStatus[] = ['DELIVERED', 'REJECTED', 'CANCELLED'];

interface Transition {
  from: RequestStatus[];
  /** null: the target depends on history (answer returns to the status before clarification). */
  to: RequestStatus | null;
  by: RequestRole[];
}

/**
 * Request lifecycle. Delivery (COMPLETED/IN_PROGRESS → DELIVERED) happens when a deliverable is
 * published, not through an action. Approval (autonomy level 1) does not change the status: it
 * releases a PENDING request to its assignee.
 */
export const TRANSITIONS: Record<RequestAction, Transition> = {
  approve: { from: ['PENDING'], to: 'PENDING', by: ['creator', 'manager'] },
  accept: { from: ['PENDING'], to: 'ACCEPTED', by: ['assignee'] },
  reject: { from: ['PENDING', 'ACCEPTED'], to: 'REJECTED', by: ['assignee'] },
  start: { from: ['ACCEPTED', 'PENDING'], to: 'IN_PROGRESS', by: ['assignee'] },
  clarify: {
    from: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'],
    to: 'WAITING_FOR_CLARIFICATION',
    by: ['assignee'],
  },
  answer: { from: ['WAITING_FOR_CLARIFICATION'], to: null, by: ['creator', 'manager'] },
  complete: { from: ['IN_PROGRESS'], to: 'COMPLETED', by: ['assignee'] },
  cancel: {
    from: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_CLARIFICATION', 'COMPLETED'],
    to: 'CANCELLED',
    by: ['creator', 'manager'],
  },
};

export type TransitionDenial =
  'INVALID_STATE' | 'NOT_ALLOWED' | 'AWAITING_APPROVAL' | 'ALREADY_APPROVED';

export function checkTransition(params: {
  action: RequestAction;
  status: RequestStatus;
  roles: RequestRole[];
  awaitingApproval: boolean;
}): TransitionDenial | null {
  const rule = TRANSITIONS[params.action];
  if (!rule.by.some((r) => params.roles.includes(r))) return 'NOT_ALLOWED';
  if (!rule.from.includes(params.status)) return 'INVALID_STATE';
  if (params.action === 'approve') return params.awaitingApproval ? null : 'ALREADY_APPROVED';
  // Until approved, the assignee cannot act on a suggested request.
  if (params.awaitingApproval && params.action !== 'cancel') return 'AWAITING_APPROVAL';
  return null;
}

/** Actions an actor can take now (drives buttons in the UI and the MCP tool help). */
export function availableActions(
  status: RequestStatus,
  roles: RequestRole[],
  awaitingApproval: boolean,
): RequestAction[] {
  return REQUEST_ACTIONS.filter(
    (action) => checkTransition({ action, status, roles, awaitingApproval }) === null,
  );
}

/** Same project, type, assignee and normalized title ⇒ same request (repetition detection). */
export function requestFingerprint(input: {
  projectId: string;
  type: string;
  assigneeUserId?: string | null;
  assigneeAgentId?: string | null;
  title: string;
}): string {
  const title = input.title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(
      [
        input.projectId,
        input.type,
        input.assigneeUserId ?? '',
        input.assigneeAgentId ?? '',
        title,
      ].join('|'),
    )
    .digest('hex');
}
