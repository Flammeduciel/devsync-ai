'use client';

import type { TeamRole } from '@devsync/validation';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { roleLabel } from '@/lib/format';
import { removeMemberAction, updateMemberRoleAction } from '../teams/actions';

export function MemberRowActions({
  teamId,
  userId,
  role,
  assignableRoles,
  canRemove,
  isSelf,
}: {
  teamId: string;
  userId: string;
  role: TeamRole;
  assignableRoles: TeamRole[];
  canRemove: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeRole = (next: TeamRole) =>
    startTransition(async () => {
      const result = await updateMemberRoleAction(teamId, userId, next);
      if (result.ok) toast.success(`Role changed to ${roleLabel(next)}`);
      else toast.error(result.error);
    });

  const remove = () => {
    if (!confirm(isSelf ? 'Leave this team?' : 'Remove this member from the team?')) return;
    startTransition(async () => {
      const result = await removeMemberAction(teamId, userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (isSelf) router.replace('/');
      else toast.success('Member removed');
    });
  };

  const roles = assignableRoles.includes(role) ? assignableRoles : [role, ...assignableRoles];
  return (
    <div className="flex items-center justify-end gap-2">
      {assignableRoles.length > 0 ? (
        <NativeSelect
          aria-label="Role"
          value={role}
          disabled={pending}
          onChange={(event) => changeRole(event.target.value as TeamRole)}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <span className="text-sm text-muted-foreground">{roleLabel(role)}</span>
      )}
      {canRemove ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
          {isSelf ? 'Leave' : 'Remove'}
        </Button>
      ) : null}
    </div>
  );
}
