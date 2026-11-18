'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { revokeMachineAction } from './actions';

export function RevokeMachineButton({ teamId, machineId, name }: { teamId: string; machineId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke "${name}"? Its Bridge is disconnected immediately and must be paired again.`)) return;
        startTransition(async () => {
          const result = await revokeMachineAction(teamId, machineId);
          if (result.ok) toast.success('Machine revoked');
          else toast.error(result.error);
        });
      }}
    >
      Revoke
    </Button>
  );
}
