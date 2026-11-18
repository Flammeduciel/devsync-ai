'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { updateTeamSchema, type UpdateTeamInput } from '@devsync/validation';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { updateTeamAction } from '../teams/actions';

export function TeamSettingsForm({ teamId, name, slug }: { teamId: string; name: string; slug: string }) {
  const router = useRouter();
  const form = useForm<UpdateTeamInput>({ resolver: zodResolver(updateTeamSchema), defaultValues: { name, slug } });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateTeamAction(teamId, values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Team updated');
    if (result.data.slug !== slug) router.replace(`/t/${result.data.slug}/settings` as never);
    else form.reset(values);
  });

  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-4" noValidate>
      <FormField id="team-name" label="Name" error={errors.name?.message}>
        <Input id="team-name" aria-invalid={!!errors.name} {...form.register('name')} />
      </FormField>
      <FormField id="team-slug" label="URL" error={errors.slug?.message} hint="Lowercase letters, digits and dashes.">
        <Input id="team-slug" aria-invalid={!!errors.slug} {...form.register('slug')} />
      </FormField>
      <Button type="submit" className="justify-self-start" disabled={isSubmitting || !isDirty}>
        Save
      </Button>
    </form>
  );
}
