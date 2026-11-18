'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { revokeInvitationAction } from '../teams/actions';

export function RevokeInvitationButton({
  teamId,
  invitationId,
}: {
  teamId: string;
  invitationId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await revokeInvitationAction(teamId, invitationId);
          if (result.ok) toast.success('Invitation revoked');
          else toast.error(result.error);
        })
      }
    >
      Revoke
    </Button>
  );
}
