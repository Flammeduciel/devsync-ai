'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createTeamSchema, type CreateTeamInput } from '@devsync/validation';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { createTeamAction } from './actions';

export function CreateTeamForm() {
  const router = useRouter();
  const form = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createTeamAction(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/t/${result.data.slug}` as never);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="team-name" label="Team name" error={errors.name?.message}>
        <Input
          id="team-name"
          placeholder="Payments squad"
          autoFocus
          aria-invalid={!!errors.name}
          {...form.register('name')}
        />
      </FormField>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create team'}
      </Button>
    </form>
  );
}
