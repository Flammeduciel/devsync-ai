import type { RequestStatus } from '@devsync/validation';

export const STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  WAITING_FOR_CLARIFICATION: 'Needs clarification',
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const STATUS_STYLE: Record<RequestStatus, string> = {
  PENDING: 'bg-warning/20 text-foreground',
  ACCEPTED: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  WAITING_FOR_CLARIFICATION: 'bg-warning/25 text-foreground',
  COMPLETED: 'bg-success/15 text-success',
  DELIVERED: 'bg-success/20 text-success',
  REJECTED: 'bg-destructive/15 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export const ACTION_LABEL: Record<string, string> = {
  approve: 'Approve',
  accept: 'Accept',
  reject: 'Reject',
  start: 'Start',
  clarify: 'Ask a question',
  answer: 'Answer',
  complete: 'Mark complete',
  cancel: 'Cancel request',
};
