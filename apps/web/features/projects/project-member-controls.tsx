'use client';

import type { ProjectRole } from '@devsync/validation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { roleLabel } from '@/lib/format';
import { addProjectMemberAction, removeProjectMemberAction, removeRepositoryAction } from './actions';

const PROJECT_ROLES: ProjectRole[] = ['MAINTAINER', 'CONTRIBUTOR', 'VIEWER'];

export function AddProjectMemberForm({ projectId, candidates }: { projectId: string; candidates: { id: string; name: string }[] }) {
  const [userId, setUserId] = useState(candidates[0]?.id ?? '');
  const [role, setRole] = useState<ProjectRole>('CONTRIBUTOR');
  const [pending, startTransition] = useTransition();
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Every team member already has access.</p>;
  }
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addProjectMemberAction(projectId, { userId, role });
          if (result.ok) toast.success('Member added');
          else toast.error(result.error);
        });
      }}
    >
      <NativeSelect aria-label="Team member" className="flex-1" value={userId} onChange={(e) => setUserId(e.target.value)}>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Project role" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
        {PROJECT_ROLES.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline" disabled={pending}>
        Add
      </Button>
    </form>
  );
}

export function RemoveButton({ kind, projectId, id }: { kind: 'member' | 'repository'; projectId: string; id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result =
            kind === 'member' ? await removeProjectMemberAction(projectId, id) : await removeRepositoryAction(projectId, id);
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      Remove
    </Button>
  );
}
