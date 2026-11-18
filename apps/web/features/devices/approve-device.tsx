'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { approveDeviceAction, denyDeviceAction } from './actions';

export function ApproveDevice({ userCode, teams }: { userCode: string; teams: { id: string; name: string }[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [result, setResult] = useState<'approved' | 'denied' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (result === 'approved') return <p className="text-sm">✔ Approved. You can return to your terminal.</p>;
  if (result === 'denied') return <p className="text-sm">The request was denied. Nothing was connected.</p>;
  if (teams.length === 0) return <p className="text-sm text-muted-foreground">You need a Developer role (or higher) in a team to connect an agent.</p>;

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, next: 'approved' | 'denied') =>
    startTransition(async () => {
      const r = await action();
      if (r.ok) setResult(next);
      else setError(r.error ?? 'Something went wrong');
    });

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        Team
        <NativeSelect value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-3">
        <Button disabled={pending} onClick={() => run(() => approveDeviceAction(userCode, teamId), 'approved')}>
          Approve
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(() => denyDeviceAction(userCode), 'denied')}>
          Deny
        </Button>
      </div>
    </div>
  );
}
