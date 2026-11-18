'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteTeamAction } from '../teams/actions';

export function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (prompt(`Type "${teamName}" to delete this team`) !== teamName) return;
        startTransition(async () => {
          const result = await deleteTeamAction(teamId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.replace('/');
          router.refresh();
        });
      }}
    >
      Delete team
    </Button>
  );
}
