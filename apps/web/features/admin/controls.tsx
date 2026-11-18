'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { setSignupModeAction, setTeamSuspendedAction, setUserSuspendedAction } from './actions';

export function SuspendButton({ kind, id, suspended, label }: { kind: 'user' | 'team'; id: string; suspended: boolean; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={suspended ? 'outline' : 'ghost'}
      disabled={pending}
      onClick={() => {
        if (!suspended && !confirm(`Suspend ${label}? Access is cut immediately (web, agents, realtime).`)) return;
        startTransition(async () => {
          const r = kind === 'user' ? await setUserSuspendedAction(id, !suspended) : await setTeamSuspendedAction(id, !suspended);
          if (r.ok) toast.success(suspended ? 'Reactivated' : 'Suspended');
          else toast.error(r.error);
        });
      }}
    >
      {suspended ? 'Reactivate' : 'Suspend'}
    </Button>
  );
}

const MODES = [
  ['OPEN', 'Open — anyone can create an account'],
  ['INVITE_ONLY', 'Invitation only — only invited emails'],
  ['CLOSED', 'Closed — no new accounts (admins excepted)'],
] as const;

export function SignupModeSelect({ value }: { value: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      aria-label="Sign-up mode"
      defaultValue={value}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const r = await setSignupModeAction(e.target.value as 'OPEN');
          if (r.ok) toast.success('Sign-up mode updated');
          else toast.error(r.error);
        })
      }
    >
      {MODES.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}
