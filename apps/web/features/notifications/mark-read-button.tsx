'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { markNotificationsReadAction } from '../collaboration/actions';

export function MarkReadButton({ teamId, ids, label }: { teamId: string; ids: string[] | 'all'; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => void (await markNotificationsReadAction(teamId, ids)))}>
      {label}
    </Button>
  );
}
