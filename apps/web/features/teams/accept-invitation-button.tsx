'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { acceptInvitationAction } from './actions';

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await acceptInvitationAction(token);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.replace(`/t/${result.data.teamSlug}` as never);
        })
      }
    >
      {pending ? 'Joining…' : 'Join the team'}
    </Button>
  );
}
