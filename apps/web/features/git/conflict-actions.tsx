'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updateConflictAction } from './actions';

export function ConflictActions({ conflictId, status }: { conflictId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const run = (next: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED', label: string) =>
    startTransition(async () => {
      const r = await updateConflictAction(conflictId, next);
      if (r.ok) toast.success(label);
      else toast.error(r.error);
    });
  return (
    <div className="flex gap-1">
      {status === 'OPEN' ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run('ACKNOWLEDGED', 'Acknowledged')}>
          Acknowledge
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run('RESOLVED', 'Marked resolved')}>
        Resolved
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run('DISMISSED', 'Dismissed')}>
        Dismiss
      </Button>
    </div>
  );
}
