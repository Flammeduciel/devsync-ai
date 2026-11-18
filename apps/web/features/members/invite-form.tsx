'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { inviteMemberSchema, type TeamRole } from '@devsync/validation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { roleLabel } from '@/lib/format';
import { inviteMemberAction } from '../teams/actions';

type Values = z.input<typeof inviteMemberSchema>;

export function InviteForm({ teamId, roles }: { teamId: string; roles: TeamRole[] }) {
  const form = useForm<Values>({ resolver: zodResolver(inviteMemberSchema), defaultValues: { email: '', role: 'DEVELOPER' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await inviteMemberAction(teamId, inviteMemberSchema.parse(values));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Invitation sent to ${values.email}`);
    form.reset({ email: '', role: values.role });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
      <div className="flex-1">
        <Input
          aria-label="Email address"
          type="email"
          placeholder="teammate@company.com"
          aria-invalid={!!errors.email}
          {...form.register('email')}
        />
        {errors.email ? <p role="alert" className="mt-1 text-sm text-destructive">{errors.email.message}</p> : null}
      </div>
      <NativeSelect aria-label="Role" {...form.register('role')}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Invite'}</Button>
    </form>
  );
}
