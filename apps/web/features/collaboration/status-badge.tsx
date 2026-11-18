import type { RequestStatus } from '@devsync/validation';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, STATUS_STYLE } from './labels';

export function RequestStatusBadge({ status, awaitingApproval }: { status: RequestStatus; awaitingApproval?: boolean }) {
  if (awaitingApproval) return <span className="rounded-md bg-warning/25 px-2 py-0.5 text-xs font-medium">Awaiting approval</span>;
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}
