'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { updateAutonomyAction } from '../collaboration/actions';

type Level = 'SUGGEST' | 'CONTROLLED' | 'COORDINATED';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

const LEVELS: [Level, string, string][] = [
  ['SUGGEST', 'Level 1 — Suggest only', 'Agents propose requests; a developer approves each one before it is sent.'],
  ['CONTROLLED', 'Level 2 — Controlled (recommended)', 'Agents send requests within the limits below. No request chains.'],
  ['COORDINATED', 'Level 3 — Coordinated', 'Agents may also ask other agents for what they need to fulfil a request, up to the chain depth.'],
];

export function AutonomyForm({ teamId, policy, editable }: { teamId: string; policy: { level: Level; maxRequestsPerHour: number; maxPriority: Priority; maxChainDepth: number; requireApprovalActions: string[] }; editable: boolean }) {
  const [level, setLevel] = useState<Level>(policy.level);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateAutonomyAction(teamId, {
            projectId: null,
            level,
            maxRequestsPerHour: Number(f.get('maxRequestsPerHour')),
            maxPriority: String(f.get('maxPriority')) as Priority,
            maxChainDepth: Number(f.get('maxChainDepth')),
            requireApprovalActions: f.get('approveAll') ? ['request.create'] : [],
          });
          if (result.ok) toast.success('Autonomy policy saved');
          else toast.error(result.error);
        });
      }}
    >
      <fieldset className="grid gap-2" disabled={!editable}>
        <legend className="mb-1 text-sm font-medium">Autonomy level of agents</legend>
        {LEVELS.map(([value, label, help]) => (
          <label key={value} className="flex cursor-pointer gap-3 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-accent/40">
            <input type="radio" name="level" value={value} checked={level === value} onChange={() => setLevel(value)} className="mt-1" />
            <span>
              <span className="font-medium">{label}</span>
              <span className="block text-muted-foreground">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3" disabled={!editable}>
        <FormField id="maxRequestsPerHour" label="Requests per agent per hour">
          <Input id="maxRequestsPerHour" name="maxRequestsPerHour" type="number" min={1} max={500} defaultValue={policy.maxRequestsPerHour} />
        </FormField>
        <FormField id="maxPriority" label="Max priority without approval">
          <NativeSelect id="maxPriority" name="maxPriority" defaultValue={policy.maxPriority}>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="maxChainDepth" label="Max request chain depth (level 3)">
          <Input id="maxChainDepth" name="maxChainDepth" type="number" min={0} max={10} defaultValue={policy.maxChainDepth} />
        </FormField>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="approveAll" defaultChecked={policy.requireApprovalActions.includes('request.create')} disabled={!editable} />
        Always require a developer approval for agent requests
      </label>
      {editable ? (
        <Button type="submit" className="justify-self-start" disabled={pending}>
          Save policy
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins can change the autonomy policy.</p>
      )}
    </form>
  );
}
