import type { AgentStatus } from '@devsync/validation';
import { cn } from '@/lib/utils';

const STYLES: Record<AgentStatus, string> = {
  ONLINE: 'bg-success/15 text-success',
  WORKING: 'bg-primary/15 text-primary',
  IDLE: 'bg-muted text-muted-foreground',
  WAITING: 'bg-warning/20 text-foreground',
  ERROR: 'bg-destructive/15 text-destructive',
  OFFLINE: 'bg-muted text-muted-foreground',
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', STYLES[status])}>
      <span aria-hidden className={cn('size-1.5 rounded-full bg-current', status === 'WORKING' && 'animate-pulse')} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
